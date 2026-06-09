package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

type pauseOptions struct {
	until string
}

var pauseOpts pauseOptions

var pauseCmd = &cobra.Command{
	Use:   "pause",
	Short: "Pause gitfuse sync for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPause(cmd, pauseOpts)
	},
}

func init() {
	pauseCmd.Flags().StringVar(&pauseOpts.until, "until", "", "auto-resume after a one-shot event")
	rootCmd.AddCommand(pauseCmd)
}

func runPause(cmd *cobra.Command, opts pauseOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := workspace.SetPaused(repoPath, true); err != nil {
		return fmt.Errorf("pause ledger: %w", err)
	}
	if opts.until != "" {
		if opts.until != "git commit" {
			return fmt.Errorf("unsupported pause condition %q; supported: git commit", opts.until)
		}
		if err := installResumeHook(repoPath); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "gitfuse paused until next git commit.")
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "gitfuse paused.")
	return nil
}

func installResumeHook(repoPath string) error {
	hooksDir := filepath.Join(repoPath, ".git", "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return err
	}
	hookPath := filepath.Join(hooksDir, "post-commit")
	backupPath := filepath.Join(hooksDir, "post-commit.gitfuse.bak")
	existing, err := os.ReadFile(hookPath)
	if err == nil && len(existing) > 0 && !strings.Contains(string(existing), "gitfuse one-shot resume hook") {
		if err := os.WriteFile(backupPath, existing, 0o755); err != nil {
			return err
		}
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	script := fmt.Sprintf(`#!/bin/sh
# gitfuse one-shot resume hook
if [ -x %q ]; then
  %q resume >/dev/null 2>&1 || true
fi
if [ -f %q ]; then
  mv %q "$0"
else
  rm -f "$0"
fi
`, exe, exe, backupPath, backupPath)
	return os.WriteFile(hookPath, []byte(script), 0o755)
}
