package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

type autosyncEnableOptions struct {
	delay string
}

var autosyncEnableOpts autosyncEnableOptions

var autosyncCmd = &cobra.Command{
	Use:   "autosync",
	Short: "Manage automatic GitFuse sync for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

var autosyncEnableCmd = &cobra.Command{
	Use:   "enable",
	Short: "Enable automatic GitFuse sync for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAutosyncEnable(cmd.Context(), cmd, autosyncEnableOpts)
	},
}

var autosyncDisableCmd = &cobra.Command{
	Use:   "disable",
	Short: "Disable automatic GitFuse sync for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAutosyncDisable(cmd)
	},
}

var autosyncStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show automatic GitFuse sync status for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAutosyncStatus(cmd)
	},
}

func init() {
	autosyncEnableCmd.Flags().StringVar(&autosyncEnableOpts.delay, "delay", "0s", "buffer commits before upload, such as 5s or 2m")
	autosyncCmd.AddCommand(autosyncEnableCmd)
	autosyncCmd.AddCommand(autosyncDisableCmd)
	autosyncCmd.AddCommand(autosyncStatusCmd)
	rootCmd.AddCommand(autosyncCmd)
}

func runAutosyncEnable(ctx context.Context, cmd *cobra.Command, opts autosyncEnableOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if _, err := workspace.ReadLedger(repoPath); err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	if err := runStart(ctx, cmd, startOptions{auto: true, delay: opts.delay}); err != nil {
		return err
	}
	if err := workspace.SetPaused(repoPath, false); err != nil {
		return fmt.Errorf("enable autosync ledger: %w", err)
	}
	return nil
}

func runAutosyncDisable(cmd *cobra.Command) error {
	return runPause(cmd, pauseOptions{})
}

func runAutosyncStatus(cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	hookInstalled, err := autoSyncHookInstalled(repoPath)
	if err != nil {
		return err
	}
	state := "disabled"
	if hookInstalled && !ledger.Paused {
		state = "enabled"
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Auto sync: %s\n", state)
	fmt.Fprintf(cmd.OutOrStdout(), "Hook installed: %t\n", hookInstalled)
	fmt.Fprintf(cmd.OutOrStdout(), "Paused: %t\n", ledger.Paused)
	return nil
}

func autoSyncHookInstalled(repoPath string) (bool, error) {
	content, err := os.ReadFile(filepath.Join(repoPath, ".git", "hooks", "post-commit"))
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return strings.Contains(string(content), "gitfuse auto sync hook"), nil
}
