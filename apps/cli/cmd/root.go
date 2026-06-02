package cmd

import (
	"fmt"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "gitfuse",
	Short: "Encrypted committed-git sync across devices",
	Long: "gitfuse syncs committed git objects between devices through an encrypted relay.\n" +
		"It never syncs untracked files, working tree changes, or stashes.",
}

var configDirCmd = &cobra.Command{
	Use:   "config-dir",
	Short: "Print and create the global gitfuse config directory",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, err := config.EnsureGlobalDir()
		if err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), dir)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(configDirCmd)
}

func Execute() error {
	return rootCmd.Execute()
}
