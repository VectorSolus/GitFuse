package git

import (
	"fmt"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
)

func CreateTempReplayBranch(repoPath, branchName string) error {
	repo, err := OpenRepository(repoPath)
	if err != nil {
		return err
	}
	head, err := repo.Head()
	if err != nil {
		return err
	}
	refName := plumbing.NewBranchReferenceName(branchName)
	return repo.Storer.SetReference(plumbing.NewHashReference(refName, head.Hash()))
}

func FastForwardCurrentBranch(repoPath string, target plumbing.Hash) error {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return err
	}
	head, err := repo.Head()
	if err != nil {
		return err
	}
	return repo.Storer.SetReference(plumbing.NewHashReference(head.Name(), target))
}

func DivergenceMessage(point string) string {
	return fmt.Sprintf("Parent chain does not connect to local history. Divergence point: %s", point)
}
