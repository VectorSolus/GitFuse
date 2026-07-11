package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Manage tracked GitFuse repositories",
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

var repoListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tracked GitFuse repositories",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRepoList(cmd)
	},
}

var repoRemoveCmd = &cobra.Command{
	Use:   "remove <repo>",
	Short: "Remove a repository from local GitFuse tracking",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRepoRemove(cmd, args[0])
	},
}

func init() {
	repoCmd.AddCommand(repoListCmd)
	repoCmd.AddCommand(repoRemoveCmd)
	rootCmd.AddCommand(repoCmd)
}

func runRepoList(cmd *cobra.Command) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	entries, err := trackedRepositoryEntries(cwd)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No tracked repositories.")
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "NAME\tPATH\tRELAY ENTRY")
	for _, entry := range entries {
		fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\n", displayRepoName(entry), entry.Path, dashIfEmpty(entry.RelayEntryID))
	}
	return nil
}

func runRepoRemove(cmd *cobra.Command, selector string) error {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return fmt.Errorf("repository name, path, or relay entry id is required")
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	canonicalCwd, err := canonicalPath(cwd)
	if err != nil {
		return err
	}

	_, removed, err := config.RemoveRepositoryRegistryEntry(func(entry config.RegistryEntry) bool {
		return repoSelectorMatches(selector, canonicalCwd, entry)
	})
	if err != nil {
		return err
	}
	if len(removed) == 0 {
		entry, ok, err := localTrackedRepositoryEntry(selector, canonicalCwd)
		if err != nil {
			return err
		}
		if ok {
			removed = append(removed, entry)
		}
	}
	if len(removed) == 0 {
		return fmt.Errorf("tracked repository %q not found", selector)
	}

	removedPaths := map[string]bool{}
	for _, entry := range removed {
		if strings.TrimSpace(entry.Path) == "" {
			continue
		}
		path, err := canonicalPath(entry.Path)
		if err != nil {
			return err
		}
		removedPaths[path] = true
		if err := removeLocalRepositoryTracking(path); err != nil {
			return err
		}
	}
	if err := clearActiveRepoIfRemoved(selector, removedPaths); err != nil {
		return err
	}

	name := displayRepoName(removed[0])
	fmt.Fprintf(cmd.OutOrStdout(), "Removed %s from local GitFuse tracking. Working tree and Git commits were not deleted.\n", name)
	return nil
}

func trackedRepositoryEntries(start string) ([]config.RegistryEntry, error) {
	registry, err := config.ReadRepositoryRegistry()
	if err != nil {
		return nil, err
	}
	if len(registry.Entries) > 0 {
		return registry.Entries, nil
	}
	return scanLocalTrackedRepositoryEntries(start)
}

func scanLocalTrackedRepositoryEntries(start string) ([]config.RegistryEntry, error) {
	root := start
	if repoRoot, err := findRepoRoot(start); err == nil {
		root = filepath.Dir(repoRoot)
	}
	entries := []config.RegistryEntry{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			return nil
		}
		switch entry.Name() {
		case ".git", "node_modules", ".next", ".turbo":
			return filepath.SkipDir
		case ".gitfuse":
			repoPath := filepath.Dir(path)
			localCfg, err := config.ReadLocalConfig(repoPath)
			if err == nil && (localCfg.DisplayName != "" || localCfg.RelayEntryID != "") {
				canonical, _ := canonicalPath(repoPath)
				entries = append(entries, config.RegistryEntry{
					Name:         firstNonEmpty(localCfg.DisplayName, filepath.Base(repoPath)),
					Path:         canonical,
					RootSHA:      localCfg.RootSHA,
					RelayEntryID: localCfg.RelayEntryID,
					RemoteURL:    localCfg.RemoteURL,
				})
			}
			return filepath.SkipDir
		default:
			return nil
		}
	})
	return entries, err
}

func localTrackedRepositoryEntry(selector, canonicalCwd string) (config.RegistryEntry, bool, error) {
	targetPath := canonicalCwd
	if resolved, ok, err := resolveRepoSelectorPath(selector, canonicalCwd); err != nil {
		return config.RegistryEntry{}, false, err
	} else if ok {
		targetPath = resolved
	}
	localCfg, err := config.ReadLocalConfig(targetPath)
	if err != nil {
		return config.RegistryEntry{}, false, nil
	}
	entry := config.RegistryEntry{
		Name:         firstNonEmpty(localCfg.DisplayName, filepath.Base(targetPath)),
		Path:         targetPath,
		RootSHA:      localCfg.RootSHA,
		RelayEntryID: localCfg.RelayEntryID,
		RemoteURL:    localCfg.RemoteURL,
	}
	if repoSelectorMatches(selector, canonicalCwd, entry) {
		return entry, true, nil
	}
	return config.RegistryEntry{}, false, nil
}

func repoSelectorMatches(selector, canonicalCwd string, entry config.RegistryEntry) bool {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return false
	}
	if selector == "." {
		entryPath, err := canonicalPath(entry.Path)
		return err == nil && entryPath == canonicalCwd
	}
	if selector == entry.Name || selector == entry.RelayEntryID || selector == filepath.Base(entry.Path) {
		return true
	}
	resolved, ok, err := resolveRepoSelectorPath(selector, canonicalCwd)
	if err != nil || !ok {
		return false
	}
	entryPath, err := canonicalPath(entry.Path)
	return err == nil && entryPath == resolved
}

func resolveRepoSelectorPath(selector, canonicalCwd string) (string, bool, error) {
	if selector == "." {
		return canonicalCwd, true, nil
	}
	if !filepath.IsAbs(selector) && !strings.Contains(selector, "/") && !strings.Contains(selector, "\\") {
		return "", false, nil
	}
	path := selector
	if !filepath.IsAbs(path) {
		path = filepath.Join(canonicalCwd, path)
	}
	resolved, err := canonicalPath(path)
	if err != nil {
		return "", false, err
	}
	return resolved, true, nil
}

func removeLocalRepositoryTracking(repoPath string) error {
	gitfuseDir := config.GitfuseDir(repoPath)
	for _, name := range []string{"config", "ledger"} {
		path := filepath.Join(gitfuseDir, name)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove %s: %w", path, err)
		}
	}
	if err := os.Remove(gitfuseDir); err != nil && !os.IsNotExist(err) && !isDirectoryNotEmpty(err) {
		return fmt.Errorf("remove %s: %w", gitfuseDir, err)
	}
	return nil
}

func clearActiveRepoIfRemoved(selector string, removedPaths map[string]bool) error {
	active, err := config.ReadActiveRepo()
	if err != nil {
		return nil
	}
	activePath, err := canonicalPath(active.Path)
	if err == nil && removedPaths[activePath] {
		return config.RemoveActiveRepo()
	}
	if selector == active.Name || selector == active.Path || selector == filepath.Base(active.Path) {
		return config.RemoveActiveRepo()
	}
	return nil
}

func isDirectoryNotEmpty(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "directory not empty")
}

func displayRepoName(entry config.RegistryEntry) string {
	return firstNonEmpty(entry.Name, filepath.Base(entry.Path), entry.RelayEntryID, "repository")
}

func dashIfEmpty(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}
