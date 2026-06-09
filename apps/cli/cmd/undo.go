package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

var undoCmd = &cobra.Command{
	Use:   "undo",
	Short: "Reverse the last gitfuse sync event",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runUndo(cmd)
	},
}

func init() {
	rootCmd.AddCommand(undoCmd)
}

func runUndo(cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), "Undo last sync event")
	fmt.Fprintf(cmd.OutOrStdout(), "Current synced_head: %s\n", emptyValue(ledger.SyncedHead))
	fmt.Fprintf(cmd.OutOrStdout(), "Previous synced_head: %s\n", emptyValue(ledger.PreviousSyncedHead))
	confirmed, err := confirm(cmd, "Undo this sync event? Type yes to continue: ")
	if err != nil {
		return err
	}
	if !confirmed {
		fmt.Fprintln(cmd.OutOrStdout(), "Undo cancelled. Local git history untouched.")
		return nil
	}

	if err := deleteRelayBundleIfConfigured(cmd.Context(), ledger.SyncedHead); err != nil {
		return err
	}
	if err := os.Remove(filepath.Join(config.GitfuseDir(repoPath), "last-sync.bundle")); err != nil && !os.IsNotExist(err) {
		return err
	}
	restored, err := workspace.UndoLastSync(repoPath)
	if err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Undid last sync event. synced_head reset to %s. Local git history untouched.\n", emptyValue(restored))
	return nil
}

func emptyValue(value string) string {
	if value == "" {
		return "(empty)"
	}
	return value
}
