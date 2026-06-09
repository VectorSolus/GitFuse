package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

var useCmd = &cobra.Command{
	Use:   "use <name>",
	Short: "Set the active gitfuse repository",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runUse(cmd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(useCmd)
}

func runUse(cmd *cobra.Command, name string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	statuses, err := discoverRegisteredRepos(cwd)
	if err != nil {
		return err
	}
	for _, status := range statuses {
		if status.DisplayName == name || filepath.Base(status.Path) == name {
			if _, err := config.WriteActiveRepo(config.ActiveRepo{Name: status.DisplayName, Path: status.Path}); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "Active repo: %s (%s)\n", status.DisplayName, status.Path)
			return nil
		}
	}
	return fmt.Errorf("repo %q not found", name)
}
