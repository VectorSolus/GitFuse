package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Connect this device to existing relay repositories",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runConnect(cmd)
	},
}

func init() {
	rootCmd.AddCommand(connectCmd)
}

func runConnect(cmd *cobra.Command) error {
	repos, err := loadRelayRepositories()
	if err != nil {
		return err
	}
	scanRoot := os.Getenv("GITFUSE_SCAN_ROOT")
	if scanRoot == "" {
		scanRoot, err = os.Getwd()
		if err != nil {
			return err
		}
	}
	matches, err := scanForRootSHAMatches(scanRoot, repos)
	if err != nil {
		return err
	}
	if len(matches) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No local matches found.")
		fmt.Fprintln(cmd.OutOrStdout(), "Choose a manual path, run gitfuse restore <relay-entry-name>, or skip.")
		return nil
	}
	options := make([]tui.RepoOption, 0, len(matches))
	for _, match := range matches {
		options = append(options, tui.RepoOption{Name: match.repo.DisplayName, Path: match.path, State: "matched"})
	}
	if os.Getenv("GITFUSE_NONINTERACTIVE") == "1" {
		fmt.Fprintln(cmd.OutOrStdout(), "TUI repo picker launched.")
	}
	selected, err := tui.PickRepo(options)
	if err != nil {
		return err
	}
	var picked rootSHAMatch
	for _, match := range matches {
		if match.path == selected.Path {
			picked = match
			break
		}
	}
	if _, err := config.WriteLocalConfig(picked.path, config.LocalConfig{
		RootSHA:      picked.repo.RootSHA,
		RelayEntryID: picked.repo.RelayEntryID,
		DisplayName:  picked.repo.DisplayName,
		RemoteURL:    picked.repo.RemoteURL,
		Platform:     detectPlatform(picked.repo.RemoteURL),
	}); err != nil {
		return err
	}
	if _, err := workspace.WriteLedger(picked.path, workspace.Ledger{}); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Linked %s at %s.\n", picked.repo.DisplayName, picked.path)
	return nil
}

type rootSHAMatch struct {
	repo relayRepository
	path string
}

func scanForRootSHAMatches(root string, repos []relayRepository) ([]rootSHAMatch, error) {
	byRoot := make(map[string]relayRepository, len(repos))
	for _, repo := range repos {
		byRoot[repo.RootSHA] = repo
	}
	var matches []rootSHAMatch
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			return nil
		}
		switch entry.Name() {
		case ".git":
			repoPath := filepath.Dir(path)
			rootSHA, err := gfgit.RootSHA(repoPath)
			if err == nil {
				if relayRepo, ok := byRoot[rootSHA]; ok {
					matches = append(matches, rootSHAMatch{repo: relayRepo, path: repoPath})
				}
			}
			return filepath.SkipDir
		case "node_modules", ".next", ".turbo":
			return filepath.SkipDir
		default:
			return nil
		}
	})
	return matches, err
}
