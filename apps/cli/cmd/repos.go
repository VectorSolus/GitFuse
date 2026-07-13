package cmd

import (
	"fmt"
	"os"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/spf13/cobra"
)

var reposCmd = &cobra.Command{
	Use:   "repos",
	Short: "Choose an active gitfuse repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRepos(cmd)
	},
}

var reposChooseCmd = &cobra.Command{
	Use:   "choose",
	Short: "Choose an active gitfuse repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRepos(cmd)
	},
}

func init() {
	reposCmd.AddCommand(reposChooseCmd)
	rootCmd.AddCommand(reposCmd)
}

func runRepos(cmd *cobra.Command) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	statuses, err := discoverRegisteredRepos(cwd)
	if err != nil {
		return err
	}
	options := repoOptions(statuses)
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		fmt.Fprintln(cmd.OutOrStdout(), "TUI repo picker launched.")
	}
	selected, err := tui.PickRepoWithTitle(options, "Choose a GitFuse repository")
	if err != nil {
		return err
	}
	if _, err := config.WriteActiveRepo(config.ActiveRepo{Name: selected.Name, Path: selected.Path}); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Active repository: %s\n", selected.Name)
	return nil
}

func repoOptions(statuses []repoStatus) []tui.RepoOption {
	options := make([]tui.RepoOption, 0, len(statuses))
	for _, status := range statuses {
		options = append(options, tui.RepoOption{
			Name:  status.DisplayName,
			Path:  status.Path,
			State: status.RelayState,
		})
	}
	return options
}
