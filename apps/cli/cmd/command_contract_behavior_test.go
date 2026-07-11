package cmd

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

func TestRepoListPrintsTrackedRepositories(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	repoPath := newPullGitRepo(t, "repo-list", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-list", initial)
	canonical, err := canonicalPath(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := config.WriteRepositoryRegistry(config.RepositoryRegistry{
		ActiveRelayEntryID: repo.RelayEntryID,
		Entries: []config.RegistryEntry{{
			Name:         repo.DisplayName,
			Path:         canonical,
			RootSHA:      repo.RootSHA,
			RelayEntryID: repo.RelayEntryID,
		}},
	}); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runRepoList(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"NAME\tPATH\tRELAY ENTRY", "repo-list", canonical, repo.RelayEntryID} {
		if !strings.Contains(output.String(), want) {
			t.Fatalf("repo list output missing %q:\n%s", want, output.String())
		}
	}
}

func TestRepoRemoveDoesNotDeleteRepositoryDirectoryOrGitCommits(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	repoPath := newPullGitRepo(t, "repo-remove", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-remove", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	canonical, err := canonicalPath(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := config.WriteRepositoryRegistry(config.RepositoryRegistry{
		ActiveRelayEntryID: repo.RelayEntryID,
		Entries: []config.RegistryEntry{{
			Name:         repo.DisplayName,
			Path:         canonical,
			RootSHA:      repo.RootSHA,
			RelayEntryID: repo.RelayEntryID,
		}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := config.WriteActiveRepo(config.ActiveRepo{Name: repo.DisplayName, Path: canonical}); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runRepoRemove(cmd, repo.DisplayName)
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Working tree and Git commits were not deleted.") {
		t.Fatalf("repo remove output = %q", output.String())
	}
	if _, err := os.Stat(repoPath); err != nil {
		t.Fatalf("repository directory missing after repo remove: %v", err)
	}
	if head := strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD")); head != initial {
		t.Fatalf("HEAD = %s, want preserved commit %s", head, initial)
	}
	for _, path := range []string{
		filepath.Join(repoPath, ".gitfuse", "config"),
		filepath.Join(repoPath, ".gitfuse", "ledger"),
	} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s still exists after repo remove: err=%v", path, err)
		}
	}
	registry, err := config.ReadRepositoryRegistry()
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Entries) != 0 || registry.ActiveRelayEntryID != "" {
		t.Fatalf("registry = %#v, want no active tracked repos", registry)
	}
	if _, err := config.ReadActiveRepo(); !os.IsNotExist(err) {
		t.Fatalf("active repo still readable after remove: err=%v", err)
	}
}

func TestHistoryOutputMatchesLogOutput(t *testing.T) {
	repoPath := newPullGitRepo(t, "repo-history", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	second := commitPullFile(t, repoPath, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	repo := syncRelayRepository("repo-history", initial)
	writePullMetadata(t, repoPath, repo, initial, "")

	var logOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &logOutput, func(cmd *cobra.Command) error {
		return runLog(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	var historyOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &historyOutput, func(cmd *cobra.Command) error {
		return runHistory(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if historyOutput.String() != logOutput.String() {
		t.Fatalf("history output differed from log output:\nhistory:\n%s\nlog:\n%s", historyOutput.String(), logOutput.String())
	}
	assertLogContains(t, historyOutput.String(), "local-only", second, "second commit")
}

func TestAutosyncStatusIsReadOnly(t *testing.T) {
	repoPath := newPullGitRepo(t, "repo-autosync-status", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-autosync-status", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	ledgerPath := filepath.Join(repoPath, ".gitfuse", "ledger")
	beforeLedger := readFile(t, ledgerPath)
	hookPath := filepath.Join(repoPath, ".git", "hooks", "post-commit")

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runAutosyncStatus(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Auto sync: disabled") {
		t.Fatalf("autosync status output = %q", output.String())
	}
	if afterLedger := readFile(t, ledgerPath); afterLedger != beforeLedger {
		t.Fatalf("autosync status changed ledger\nbefore:\n%s\nafter:\n%s", beforeLedger, afterLedger)
	}
	if _, err := os.Stat(hookPath); !os.IsNotExist(err) {
		t.Fatalf("autosync status created hook: err=%v", err)
	}
}

func TestAutosyncEnableDisableUseExistingPausedState(t *testing.T) {
	repoPath := newPullGitRepo(t, "repo-autosync", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-autosync", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	if err := workspace.SetPaused(repoPath, true); err != nil {
		t.Fatal(err)
	}

	var enableOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &enableOutput, func(cmd *cobra.Command) error {
		return runAutosyncEnable(context.Background(), cmd, autosyncEnableOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(enableOutput.String(), "gitfuse auto sync enabled.") {
		t.Fatalf("autosync enable output = %q", enableOutput.String())
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.Paused {
		t.Fatal("autosync enable left ledger paused")
	}
	hookInstalled, err := autoSyncHookInstalled(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if !hookInstalled {
		t.Fatal("autosync enable did not install the auto sync hook")
	}

	var disableOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &disableOutput, func(cmd *cobra.Command) error {
		return runAutosyncDisable(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(disableOutput.String(), "gitfuse paused.") {
		t.Fatalf("autosync disable output = %q", disableOutput.String())
	}
	ledger, err = workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if !ledger.Paused {
		t.Fatal("autosync disable did not pause ledger")
	}
}
