package git

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type BundleFile struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

type BundleCommit struct {
	SHA     string       `json:"sha"`
	Message string       `json:"message"`
	Files   []BundleFile `json:"files"`
}

type BundleManifest struct {
	RootSHA string         `json:"root_sha"`
	Commits []BundleCommit `json:"commits"`
}

type BundlePayload struct {
	Manifest BundleManifest
	Bytes    []byte
	SHA256   string
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
	for _, commit := range commits {
		files, err := committedFiles(commit)
		if err != nil {
			return BundlePayload{}, err
		}
		manifest.Commits = append(manifest.Commits, BundleCommit{
			SHA:     commit.Hash.String(),
			Message: commit.Message,
			Files:   files,
		})
	}

	bytes, err := json.Marshal(manifest)
	if err != nil {
		return BundlePayload{}, fmt.Errorf("encode bundle manifest: %w", err)
	}
	return BundlePayload{Manifest: manifest, Bytes: bytes, SHA256: SHA256(bytes)}, nil
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
