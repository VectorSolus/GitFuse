package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

var workDir string

const notAuthenticatedMessage = "Not authenticated. Run 'gitfuse auth login' first."

var rootCmd = &cobra.Command{
	Use:           "gitfuse",
	Short:         "Encrypted committed-git sync across devices",
	SilenceUsage:  true,
	SilenceErrors: true,
	Long: "gitfuse syncs committed git objects between devices through an encrypted relay.\n" +
		"It never syncs untracked files, working tree changes, or stashes.",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		if workDir == "" {
			return requireAuthIfNeeded(cmd)
		}
		if err := os.Chdir(workDir); err != nil {
			return err
		}
		return requireAuthIfNeeded(cmd)
	},
}

var configDirCmd = &cobra.Command{
	Use:   "config-dir",
	Short: "Print the resolved global gitfuse config directory",
	Long: "Print the global gitfuse configuration directory without creating it.\n\n" +
		"GITFUSE_CONFIG_DIR may point to an alternate device configuration directory. Relative override paths are resolved against the current working directory.",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, err := config.GlobalDir()
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
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return err
	}
	return nil
}

func requireAuthIfNeeded(cmd *cobra.Command) error {
	if isAllowedBeforeAuth(cmd) {
		return nil
	}
	if hasAuthCredential() {
		return nil
	}
	return errors.New(notAuthenticatedMessage)
}

func isAllowedBeforeAuth(cmd *cobra.Command) bool {
	if cmd == nil || cmd.Parent() == nil {
		return true
	}

	top := cmd
	for top.Parent() != nil && top.Parent().Parent() != nil {
		top = top.Parent()
	}

	switch top.Name() {
	case "auth", "completion", "config-dir", "doctor", "help", "update", "version":
		return true
	default:
		return false
	}
}

func hasAuthCredential() bool {
	if os.Getenv("GITFUSE_TEST_TOKEN") != "" {
		return true
	}
	credentials, err := config.ReadCredentials()
	return err == nil && credentials.Token != ""
}
