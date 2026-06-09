package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

var pickCmd = &cobra.Command{
	Use:   "pick",
	Short: "Open gitfuse interactive pickers",
}

var pickRepoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Choose an active repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRepos(cmd)
	},
}

var pickSyncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Pick commits to sync",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPickCommits(cmd, "sync")
	},
}

var pickDropCmd = &cobra.Command{
	Use:   "drop",
	Short: "Pick commits to drop",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPickCommits(cmd, "drop")
	},
}

func init() {
	pickCmd.AddCommand(pickRepoCmd, pickSyncCmd, pickDropCmd)
	rootCmd.AddCommand(pickCmd)
}

func runPickCommits(cmd *cobra.Command, action string) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	options, err := commitOptions(repoPath)
	if err != nil {
		return err
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		fmt.Fprintf(cmd.OutOrStdout(), "TUI commit picker launched for %s.\n", action)
	}
	selected, err := tui.PickCommits(options)
	if err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Selected %d commit(s) for %s.\n", len(selected), action)
	for _, commit := range selected {
		fmt.Fprintf(cmd.OutOrStdout(), "- %s %s\n", commit.SHA, commit.Message)
	}
	return nil
}

func commitOptions(repoPath string) ([]tui.CommitOption, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var options []tui.CommitOption
	err = iter.ForEach(func(commit *object.Commit) error {
		options = append(options, tui.CommitOption{
			SHA:     commit.Hash.String(),
			Message: strings.TrimSpace(firstLine(commit.Message)),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return options, nil
}
