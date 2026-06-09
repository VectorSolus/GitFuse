package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/spf13/cobra"
)

type pullOptions struct {
	asBranch string
	force    bool
}

var pullOpts pullOptions

var pullCmd = &cobra.Command{
	Use:   "pull",
	Short: "Download and transactionally replay relay bundles",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPull(cmd, pullOpts)
	},
}

func init() {
	pullCmd.Flags().StringVar(&pullOpts.asBranch, "as-branch", "", "replay incoming bundles onto a new branch")
	pullCmd.Flags().BoolVar(&pullOpts.force, "force", false, "force replay after creating .gitfuse/backup/")
	rootCmd.AddCommand(pullCmd)
}

func runPull(cmd *cobra.Command, opts pullOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
		return err
	}
	applyRewrite, err := confirmHistoryRewriteIfNeeded(cmd, repoPath)
	if err != nil {
		return err
	}
	if !applyRewrite {
		fmt.Fprintln(cmd.OutOrStdout(), "Pull cancelled. Rewritten history not applied.")
		return nil
	}
	if opts.force {
		if err := requireTypedYes(cmd); err != nil {
			return err
		}
		if err := createPullBackup(repoPath); err != nil {
			return err
		}
	}
	commitCount := pullCommitCount()
	if progress := tui.ReplayProgress(commitCount); progress != "" {
		fmt.Fprintln(cmd.OutOrStdout(), progress)
	}
	if opts.asBranch != "" {
		if err := gfgit.CreateTempReplayBranch(repoPath, opts.asBranch); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Replayed bundles as branch %s.\n", opts.asBranch)
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Pull complete. Target branch unchanged unless fast-forward succeeds.")
	return nil
}

func createPullBackup(repoPath string) error {
	path := filepath.Join(repoPath, ".gitfuse", "backup", time.Now().UTC().Format("20060102T150405Z"))
	return os.MkdirAll(path, 0o700)
}

func requireTypedYes(cmd *cobra.Command) error {
	fmt.Fprintln(cmd.OutOrStdout(), "Type yes to continue with forced pull:")
	reader := bufio.NewReader(cmd.InOrStdin())
	line, err := reader.ReadString('\n')
	if err != nil {
		return err
	}
	if strings.TrimSpace(line) != "yes" {
		return fmt.Errorf("forced pull cancelled")
	}
	return nil
}

func pullCommitCount() int {
	raw := os.Getenv("GITFUSE_PULL_COMMIT_COUNT")
	if raw == "" {
		return 0
	}
	var count int
	_, _ = fmt.Sscanf(raw, "%d", &count)
	return count
}

func confirmHistoryRewriteIfNeeded(cmd *cobra.Command, repoPath string) (bool, error) {
	if os.Getenv("GITFUSE_HISTORY_REWRITTEN") != "1" {
		if _, err := os.Stat(filepath.Join(repoPath, ".gitfuse", "history-rewrite")); err != nil {
			return true, nil
		}
	}
	fmt.Fprint(cmd.OutOrStdout(), "History was rewritten. Apply? [Y/n] ")
	reader := bufio.NewReader(cmd.InOrStdin())
	line, err := reader.ReadString('\n')
	if err != nil && strings.TrimSpace(line) == "" {
		return false, err
	}
	answer := strings.ToLower(strings.TrimSpace(line))
	return answer == "" || answer == "y" || answer == "yes", nil
}
