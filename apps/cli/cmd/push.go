package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	gogitconfig "github.com/go-git/go-git/v5/config"
	"github.com/spf13/cobra"
)

var pushCmd = &cobra.Command{
	Use:   "push",
	Short: "Push relay-curated commits to the configured git remote",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPush(cmd)
	},
}

func init() {
	rootCmd.AddCommand(pushCmd)
}

func runPush(cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	if ledger.SyncedHead == "" {
		return fmt.Errorf("no relay-curated commits are ready to push; run 'gitfuse sync' first")
	}

	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return err
	}
	head, err := repo.Head()
	if err != nil {
		return err
	}
	if head.Hash().String() != ledger.SyncedHead {
		return fmt.Errorf("local HEAD has not been synced by gitfuse; run 'gitfuse sync' before 'gitfuse push'")
	}

	remoteName, remoteURL, err := firstRemote(repo)
	if err != nil {
		fmt.Fprintln(cmd.OutOrStdout(), "No git remote configured.")
		fmt.Fprintln(cmd.OutOrStdout(), "Run 'gitfuse init' to create and configure a remote.")
		return nil
	}

	err = repo.Push(&gogit.PushOptions{
		RemoteName: remoteName,
		RefSpecs: []gogitconfig.RefSpec{
			gogitconfig.RefSpec(fmt.Sprintf("%s:%s", head.Name(), head.Name())),
		},
	})
	if err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Pushed relay-curated commits to %s (%s).\n", remoteName, remoteURL)
	return nil
}

func firstRemote(repo *gogit.Repository) (name, url string, err error) {
	remotes, err := repo.Remotes()
	if err != nil {
		return "", "", err
	}
	for _, remote := range remotes {
		cfg := remote.Config()
		if len(cfg.URLs) > 0 {
			return cfg.Name, cfg.URLs[0], nil
		}
	}
	return "", "", fmt.Errorf("no remote configured")
}
