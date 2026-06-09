package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

type resumeOptions struct {
	from int
}

var resumeOpts resumeOptions

var resumeCmd = &cobra.Command{
	Use:   "resume",
	Short: "Resume gitfuse sync for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runResume(cmd, resumeOpts)
	},
}

func init() {
	resumeCmd.Flags().IntVar(&resumeOpts.from, "from", 0, "sync only the last N commits and dispose the rest")
	rootCmd.AddCommand(resumeCmd)
}

func runResume(cmd *cobra.Command, opts resumeOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := workspace.SetPaused(repoPath, false); err != nil {
		return fmt.Errorf("resume ledger: %w", err)
	}
	if err := removeResumeHook(repoPath); err != nil {
		return err
	}
	if opts.from <= 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "gitfuse resumed.")
		return nil
	}
	selection, err := selectLastCommits(repoPath, opts.from)
	if err != nil {
		return err
	}
	if err := workspace.SetSyncedHeadForSelection(repoPath, selection.Boundary); err != nil {
		return err
	}
	if err := workspace.AddDisposedCommits(repoPath, selection.Disposed); err != nil {
		return err
	}
	if len(selection.Disposed) > 0 {
		fmt.Fprintf(cmd.OutOrStdout(), "Disposed %d older commit(s).\n", len(selection.Disposed))
	}
	return runSync(cmd.Context(), cmd, syncOptions{}, "")
}

func removeResumeHook(repoPath string) error {
	hookPath := filepath.Join(repoPath, ".git", "hooks", "post-commit")
	backupPath := filepath.Join(repoPath, ".git", "hooks", "post-commit.gitfuse.bak")
	hook, err := os.ReadFile(hookPath)
	if err == nil && string(hook) != "" {
		if _, statErr := os.Stat(backupPath); statErr == nil {
			if err := os.Rename(backupPath, hookPath); err != nil {
				return err
			}
			return nil
		}
		if containsGitfuseHook(string(hook)) {
			if err := os.Remove(hookPath); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}

func containsGitfuseHook(content string) bool {
	return strings.Contains(content, "gitfuse one-shot resume hook")
}

type resumeSelection struct {
	Boundary string
	Disposed []string
}

func selectLastCommits(repoPath string, count int) (resumeSelection, error) {
	if count <= 0 {
		return resumeSelection{}, fmt.Errorf("--from must be greater than zero")
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return resumeSelection{}, err
	}
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return resumeSelection{}, err
	}
	head, err := repo.Head()
	if err != nil {
		return resumeSelection{}, err
	}
	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return resumeSelection{}, err
	}
	defer iter.Close()

	var commits []*object.Commit
	err = iter.ForEach(func(commit *object.Commit) error {
		if ledger.SyncedHead != "" && commit.Hash.String() == ledger.SyncedHead {
			return stopResumeLog
		}
		commits = append(commits, commit)
		return nil
	})
	if err != nil && err != stopResumeLog {
		return resumeSelection{}, err
	}
	if len(commits) <= count {
		return resumeSelection{Boundary: ledger.SyncedHead}, nil
	}
	boundary := commits[count].Hash.String()
	disposed := make([]string, 0, len(commits)-count)
	for _, commit := range commits[count:] {
		disposed = append(disposed, commit.Hash.String())
	}
	return resumeSelection{Boundary: boundary, Disposed: disposed}, nil
}

var stopResumeLog = fmt.Errorf("stop resume log iteration")
