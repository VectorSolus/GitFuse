package git

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"sort"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

var (
	ErrRootSHAMismatch       = errors.New("root SHA mismatch")
	ErrParentChainDiverged   = errors.New("parent chain does not connect to local history")
	ErrRepositoryPreflight   = errors.New("repository pre-flight check failed")
	ErrBundleHashMismatch    = errors.New("bundle hash mismatch")
	ErrMissingRepositoryHead = errors.New("repository has no HEAD")
)

type ValidationResult struct {
	DivergencePoint string
}

func OpenRepository(path string) (*gogit.Repository, error) {
	repo, err := gogit.PlainOpenWithOptions(path, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return nil, fmt.Errorf("open repository: %w", err)
	}
	return repo, nil
}

func RootSHA(path string) (string, error) {
	repo, err := OpenRepository(path)
	if err != nil {
		return "", err
	}
	return RootSHAFromRepository(repo)
}

func RootSHAFromRepository(repo *gogit.Repository) (string, error) {
	head, err := repo.Head()
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrMissingRepositoryHead, err)
	}

	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return "", fmt.Errorf("read commit log: %w", err)
	}
	defer iter.Close()

	var roots []*object.Commit
	if err := iter.ForEach(func(commit *object.Commit) error {
		if commit.NumParents() == 0 {
			roots = append(roots, commit)
		}
		return nil
	}); err != nil {
		return "", fmt.Errorf("scan root commits: %w", err)
	}
	if len(roots) == 0 {
		return "", errors.New("no parentless root commit found")
	}

	sort.Slice(roots, func(i, j int) bool {
		if roots[i].Committer.When.Equal(roots[j].Committer.When) {
			return roots[i].Hash.String() < roots[j].Hash.String()
		}
		return roots[i].Committer.When.Before(roots[j].Committer.When)
	})
	return roots[0].Hash.String(), nil
}

func PreflightCheck(path string) error {
	repo, err := OpenRepository(path)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrRepositoryPreflight, err)
	}
	head, err := repo.Head()
	if err != nil {
		return fmt.Errorf("%w: %v", ErrRepositoryPreflight, err)
	}
	commit, err := repo.CommitObject(head.Hash())
	if err != nil {
		return fmt.Errorf("%w: %v", ErrRepositoryPreflight, err)
	}
	tree, err := commit.Tree()
	if err != nil {
		return fmt.Errorf("%w: %v", ErrRepositoryPreflight, err)
	}
	if err := tree.Files().ForEach(func(file *object.File) error {
		reader, err := file.Reader()
		if err != nil {
			return err
		}
		defer reader.Close()
		_, err = io.Copy(io.Discard, reader)
		return err
	}); err != nil {
		return fmt.Errorf("%w: %v", ErrRepositoryPreflight, err)
	}
	return nil
}

func ValidateLayerOneRoot(localRootSHA, incomingRootSHA string) error {
	if localRootSHA == "" || incomingRootSHA == "" || localRootSHA != incomingRootSHA {
		return fmt.Errorf("%w: local %s incoming %s", ErrRootSHAMismatch, localRootSHA, incomingRootSHA)
	}
	return nil
}

func VerifyParentChain(localCommitHashes map[string]struct{}, oldestIncomingParents []string) (ValidationResult, error) {
	if len(oldestIncomingParents) == 0 {
		return ValidationResult{}, fmt.Errorf("%w: incoming commit has no parent", ErrParentChainDiverged)
	}
	for _, parent := range oldestIncomingParents {
		if _, ok := localCommitHashes[parent]; ok {
			return ValidationResult{DivergencePoint: parent}, nil
		}
	}
	return ValidationResult{DivergencePoint: oldestIncomingParents[0]}, fmt.Errorf("%w: divergence at %s", ErrParentChainDiverged, oldestIncomingParents[0])
}

func ValidateBundleHash(expected, actual string) error {
	if expected == "" || actual == "" || expected != actual {
		return fmt.Errorf("%w: expected %s actual %s", ErrBundleHashMismatch, expected, actual)
	}
	return nil
}

func GitDir(path string) string {
	return filepath.Join(path, ".git")
}

func HashSet(hashes ...plumbing.Hash) map[string]struct{} {
	set := make(map[string]struct{}, len(hashes))
	for _, hash := range hashes {
		set[hash.String()] = struct{}{}
	}
	return set
}
