package git

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"sort"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type BundleFile struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

type BundleCommit struct {
	SHA        string            `json:"sha"`
	Message    string            `json:"message"`
	Files      []BundleFile      `json:"files"`
	Submodules []BundleSubmodule `json:"submodules,omitempty"`
}

type BundleManifest struct {
	RootSHA string         `json:"root_sha"`
	Commits []BundleCommit `json:"commits"`
}

type BundleSubmodule struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

type BundlePayload struct {
	Manifest   BundleManifest
	Bytes      []byte
	SHA256     string
	Submodules []BundleSubmodule
}

func CreateIncrementalBundle(path, syncedHead string) (BundlePayload, error) {
	repo, err := OpenRepository(path)
	if err != nil {
		return BundlePayload{}, err
	}
	root, err := RootSHAFromRepository(repo)
	if err != nil {
		return BundlePayload{}, err
	}
	head, err := repo.Head()
	if err != nil {
		return BundlePayload{}, fmt.Errorf("read HEAD: %w", err)
	}

	commits, err := commitsAfter(repo, head.Hash(), syncedHead)
	if err != nil {
		return BundlePayload{}, err
	}
	manifest := BundleManifest{RootSHA: root, Commits: make([]BundleCommit, 0, len(commits))}
	submoduleSet := make(map[string]BundleSubmodule)
	for _, commit := range commits {
		files, err := committedFiles(commit)
		if err != nil {
			return BundlePayload{}, err
		}
		submodules, err := committedSubmodules(commit)
		if err != nil {
			return BundlePayload{}, err
		}
		for _, submodule := range submodules {
			submoduleSet[submodule.Path] = submodule
		}
		manifest.Commits = append(manifest.Commits, BundleCommit{
			SHA:        commit.Hash.String(),
			Message:    commit.Message,
			Files:      files,
			Submodules: submodules,
		})
	}

	bytes, err := json.Marshal(manifest)
	if err != nil {
		return BundlePayload{}, fmt.Errorf("encode bundle manifest: %w", err)
	}
	submodules := make([]BundleSubmodule, 0, len(submoduleSet))
	for _, submodule := range submoduleSet {
		submodules = append(submodules, submodule)
	}
	sort.Slice(submodules, func(i, j int) bool { return submodules[i].Path < submodules[j].Path })
	return BundlePayload{Manifest: manifest, Bytes: bytes, SHA256: SHA256(bytes), Submodules: submodules}, nil
}

func SHA256(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func VerifyBundleHash(payload []byte, expected string) error {
	return ValidateBundleHash(expected, SHA256(payload))
}

func commitsAfter(repo *gogit.Repository, head plumbing.Hash, syncedHead string) ([]*object.Commit, error) {
	iter, err := repo.Log(&gogit.LogOptions{From: head})
	if err != nil {
		return nil, fmt.Errorf("read commit log: %w", err)
	}
	defer iter.Close()

	var newestFirst []*object.Commit
	stopAt := syncedHead != ""
	err = iter.ForEach(func(commit *object.Commit) error {
		if stopAt && commit.Hash.String() == syncedHead {
			return stopeach
		}
		newestFirst = append(newestFirst, commit)
		return nil
	})
	if err != nil && err != stopeach {
		return nil, fmt.Errorf("select bundle commits: %w", err)
	}
	for i, j := 0, len(newestFirst)-1; i < j; i, j = i+1, j-1 {
		newestFirst[i], newestFirst[j] = newestFirst[j], newestFirst[i]
	}
	return newestFirst, nil
}

var stopeach = fmt.Errorf("stop iteration")

func committedFiles(commit *object.Commit) ([]BundleFile, error) {
	tree, err := commit.Tree()
	if err != nil {
		return nil, fmt.Errorf("read commit tree: %w", err)
	}
	var files []BundleFile
	err = tree.Files().ForEach(func(file *object.File) error {
		files = append(files, BundleFile{Path: file.Name, Hash: file.Hash.String()})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read committed files: %w", err)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, nil
}

func committedSubmodules(commit *object.Commit) ([]BundleSubmodule, error) {
	tree, err := commit.Tree()
	if err != nil {
		return nil, fmt.Errorf("read commit tree: %w", err)
	}

	walker := object.NewTreeWalker(tree, true, make(map[plumbing.Hash]bool))
	defer walker.Close()

	var submodules []BundleSubmodule
	for {
		name, entry, err := walker.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("scan submodules: %w", err)
		}
		if entry.Mode == filemode.Submodule {
			submodules = append(submodules, BundleSubmodule{Path: name, Hash: entry.Hash.String()})
		}
	}

	sort.Slice(submodules, func(i, j int) bool { return submodules[i].Path < submodules[j].Path })
	return submodules, nil
}
