package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/spf13/cobra"
)

var claimCmd = &cobra.Command{
	Use:   "claim",
	Short: "Claim a transferred folder and create gitfuse-restore branch",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runClaim(cmd)
	},
}

func init() {
	rootCmd.AddCommand(claimCmd)
}

func runClaim(cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
		return err
	}
	repos, err := loadRelayRepositories()
	if err != nil {
		return err
	}
	localRoot, _ := gfgit.RootSHA(repoPath)
	relayRepo, ok := relayRepoByRoot(localRoot, repos)
	if !ok {
		if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
			fmt.Fprintln(cmd.OutOrStdout(), "TUI repo picker launched.")
		}
		selected, err := tui.PickRepo(repoOptionsFromRelay(repos))
		if err != nil {
			return err
		}
		relayRepo, ok = findRelayRepository(selected.Name, repos)
		if !ok {
			return fmt.Errorf("selected relay entry not found")
		}
	}
	score, err := claimFingerprintScore(repoPath)
	if err != nil {
		return err
	}
	if score < 80 {
		fmt.Fprintf(cmd.OutOrStdout(), "Fingerprint match %.0f%% is below 80%%.\n", score)
		confirmed, err := confirm(cmd, "Claim this relay entry anyway? Type yes to continue: ")
		if err != nil {
			return err
		}
		if !confirmed {
			return fmt.Errorf("claim cancelled")
		}
	} else {
		fmt.Fprintf(cmd.OutOrStdout(), "Fingerprint match %.0f%% accepted.\n", score)
	}
	if _, err := config.WriteLocalConfig(repoPath, config.LocalConfig{
		RootSHA:      relayRepo.RootSHA,
		RelayEntryID: relayRepo.RelayEntryID,
		DisplayName:  relayRepo.DisplayName,
		RemoteURL:    relayRepo.RemoteURL,
		Platform:     detectPlatform(relayRepo.RemoteURL),
	}); err != nil {
		return err
	}
	if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{}); err != nil {
		return err
	}
	if err := createRestoreBranch(repoPath); err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Created gitfuse-restore branch. Current branch unchanged.")
	return nil
}

func relayRepoByRoot(root string, repos []relayRepository) (relayRepository, bool) {
	for _, repo := range repos {
		if repo.RootSHA == root {
			return repo, true
		}
	}
	return relayRepository{}, false
}

func repoOptionsFromRelay(repos []relayRepository) []tui.RepoOption {
	options := make([]tui.RepoOption, 0, len(repos))
	for _, repo := range repos {
		options = append(options, tui.RepoOption{Name: repo.DisplayName, Path: repo.RelayEntryID, State: "relay"})
	}
	return options
}

func claimFingerprintScore(repoPath string) (float64, error) {
	left, err := gfgit.FingerprintCommittedLikeTree(repoPath)
	if err != nil {
		return 0, err
	}
	compareDir := os.Getenv("GITFUSE_CLAIM_FINGERPRINT_DIR")
	if compareDir == "" {
		compareDir = repoPath
	}
	right, err := gfgit.FingerprintCommittedLikeTree(compareDir)
	if err != nil {
		return 0, err
	}
	if len(right) == 0 {
		return 0, nil
	}
	leftSet := make(map[string]bool, len(left))
	for _, item := range left {
		leftSet[item.Path+"="+item.Hash] = true
	}
	matches := 0
	for _, item := range right {
		if leftSet[item.Path+"="+item.Hash] {
			matches++
		}
	}
	return float64(matches) / float64(len(right)) * 100, nil
}

func createRestoreBranch(repoPath string) error {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return err
	}
	head, err := repo.Head()
	if err != nil {
		return err
	}
	return repo.Storer.SetReference(plumbing.NewHashReference(plumbing.NewBranchReferenceName("gitfuse-restore"), head.Hash()))
}

func restoreBranchPath(repoPath string) string {
	return filepath.Join(repoPath, ".git", "refs", "heads", "gitfuse-restore")
}
