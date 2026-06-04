package cmd

import (
	"fmt"
	"os"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

var workDir string

var rootCmd = &cobra.Command{
	Use:   "gitfuse",
	Short: "Encrypted committed-git sync across devices",
	Long: "gitfuse syncs committed git objects between devices through an encrypted relay.\n" +
		"It never syncs untracked files, working tree changes, or stashes.",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		if workDir == "" {
			return nil
		}
		return os.Chdir(workDir)
	},
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
	rootCmd.PersistentFlags().StringVarP(&workDir, "chdir", "C", "", "run as if gitfuse was started in this directory")
	rootCmd.AddCommand(configDirCmd)
}

func Execute() error {
	return rootCmd.Execute()
}
