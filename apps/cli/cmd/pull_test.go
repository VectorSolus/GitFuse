package cmd

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

func TestPullImportsDevice2CommitAndFastForwards(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "feature/task062")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	second := commitPullFile(t, device1, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, device1, initial)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-task062",
		RemoteURL:    "",
		RelayEntryID: "repo-task062-relay",
	})
	relay.addBundle("repo-task062-relay", "bundle-device1-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle("repo-task062-relay", "bundle-device1-second", "device-1", secondBundle, time.Unix(20, 0))
	installPullRelayTransport(t, relay)

	writePullMetadata(t, device1, relay.repo, second, initial)

	restoreParent := t.TempDir()
	var restoreOutput bytes.Buffer
	if err := runCommandInDir(t, restoreParent, &restoreOutput, func(cmd *cobra.Command) error {
		return runRestore(cmd, relay.repo.DisplayName)
	}); err != nil {
		t.Fatal(err)
	}
	device2 := filepath.Join(restoreParent, relay.repo.DisplayName)
	assertRestoredHead(t, device2, second)
	configureTestGitIdentity(t, device2)

	device2Commit := commitPullFile(t, device2, "device2.txt", "from device 2\n", "device 2 commit", time.Unix(3, 0))
	device2Bundle := mustCreatePullBundle(t, device2, second)
	relay.addBundle("repo-task062-relay", "bundle-device2", "device-2", device2Bundle, time.Unix(30, 0))

	if present, err := commitExists(device1, device2Commit); err != nil {
		t.Fatal(err)
	} else if present {
		t.Fatalf("device 1 unexpectedly had device 2 commit %s before pull", device2Commit)
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, device1, &output, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}

	if present, err := commitExists(device1, device2Commit); err != nil {
		t.Fatal(err)
	} else if !present {
		t.Fatalf("device 1 does not have pulled commit %s", device2Commit)
	}
	assertRestoredHead(t, device1, device2Commit)
	assertFileContent(t, device1, "device2.txt", "from device 2\n")
	assertFileMatchesHEAD(t, device1, "device2.txt")

	ledger, err := workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != device2Commit {
		t.Fatalf("ledger synced head = %s, want %s", ledger.SyncedHead, device2Commit)
	}
	if ledger.PreviousSyncedHead != second {
		t.Fatalf("ledger previous synced head = %s, want %s", ledger.PreviousSyncedHead, second)
	}
	if ledger.LastPullAt == "" {
		t.Fatal("ledger last_pull_at was not recorded")
	}

	if status := strings.TrimSpace(testGitOutput(t, device1, "status", "--porcelain")); status != "" {
		t.Fatalf("device 1 working tree status = %q, want clean", status)
	}
	assertGitfuseNotTrackedOrStaged(t, device1)
	if !strings.Contains(output.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("pull output = %q, want fast-forward message", output.String())
	}
	if strings.Contains(output.String(), "Pull complete. Target branch unchanged unless fast-forward succeeds.") {
		t.Fatalf("pull output used misleading legacy success: %q", output.String())
	}

	var secondOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &secondOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(secondOutput.String(), "No new commits to pull.") {
		t.Fatalf("second pull output = %q, want up-to-date message", secondOutput.String())
	}
}

func TestPullDirtyRefusalThenExistingRemoteObjectStillFastForwards(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "file1.txt", "one\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	second := commitPullFile(t, device1, "file2.txt", "two\n", "device 1 return commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	phase18Commit := commitPullFile(t, device2, "file4.txt", "phase 18\n", "device 2 phase 18 commit", time.Unix(3, 0))
	phase18Bundle := mustCreatePullBundle(t, device2, second)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-phase18-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-phase18",
		RemoteURL:    "",
		RelayEntryID: "repo-phase18-relay",
	})
	relay.addBundle(relay.repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(relay.repo.RelayEntryID, "bundle-second", "device-1", secondBundle, time.Unix(20, 0))
	relay.addBundle(relay.repo.RelayEntryID, "bundle-phase18", "device-2", phase18Bundle, time.Unix(30, 0))
	installPullRelayTransport(t, relay)
	writePullMetadata(t, device1, relay.repo, second, initial)

	if err := os.WriteFile(filepath.Join(device1, "file1.txt"), []byte("dirty edit\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	headBefore := strings.TrimSpace(testGitOutput(t, device1, "rev-parse", "HEAD"))

	var dirtyOutput bytes.Buffer
	dirtyErr := runCommandInDir(t, device1, &dirtyOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if dirtyErr == nil {
		t.Fatal("dirty pull succeeded")
	}
	if !strings.Contains(dirtyErr.Error(), "working tree has local changes") {
		t.Fatalf("dirty pull error = %q, want dirty worktree refusal", dirtyErr.Error())
	}
	if strings.Contains(dirtyOutput.String(), "No new commits to pull.") || strings.Contains(dirtyOutput.String(), "Pulled") {
		t.Fatalf("dirty pull printed success/no-op output: %q", dirtyOutput.String())
	}
	if headAfter := strings.TrimSpace(testGitOutput(t, device1, "rev-parse", "HEAD")); headAfter != headBefore {
		t.Fatalf("dirty pull moved HEAD to %s, want %s", headAfter, headBefore)
	}
	ledger, err := workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != second {
		t.Fatalf("dirty pull ledger synced head = %s, want unchanged %s", ledger.SyncedHead, second)
	}
	if _, err := os.Stat(filepath.Join(device1, "file4.txt")); !os.IsNotExist(err) {
		t.Fatalf("dirty pull created file4.txt, stat err = %v", err)
	}
	if present, err := commitExists(device1, phase18Commit); err != nil {
		t.Fatal(err)
	} else if present {
		t.Fatalf("dirty pull imported remote commit object %s", phase18Commit)
	}

	testGit(t, device1, "restore", "file1.txt")
	importBundleObjectWithoutBranchUpdate(t, device1, phase18Bundle)
	if present, err := commitExists(device1, phase18Commit); err != nil {
		t.Fatal(err)
	} else if !present {
		t.Fatalf("expected partial-imported object %s to exist", phase18Commit)
	}
	if reachable, err := commitReachableFrom(device1, phase18Commit, headBefore); err != nil {
		t.Fatal(err)
	} else if reachable {
		t.Fatalf("partial-imported commit %s was unexpectedly reachable from HEAD %s", phase18Commit, headBefore)
	}

	var cleanOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &cleanOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(cleanOutput.String(), "No new commits to pull.") {
		t.Fatalf("clean pull incorrectly no-oped with behind HEAD: %q", cleanOutput.String())
	}
	if !strings.Contains(cleanOutput.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("clean pull output = %q, want fast-forward", cleanOutput.String())
	}
	assertRestoredHead(t, device1, phase18Commit)
	assertFileContent(t, device1, "file4.txt", "phase 18\n")
	ledger, err = workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != phase18Commit {
		t.Fatalf("clean pull ledger synced head = %s, want %s", ledger.SyncedHead, phase18Commit)
	}
	assertCleanWorktree(t, device1)
	assertGitfuseNotTrackedOrStaged(t, device1)

	var noopOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &noopOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(noopOutput.String(), "No new commits to pull.") {
		t.Fatalf("reachable remote head pull output = %q, want no-op", noopOutput.String())
	}
}

func TestPullRefusesUntrackedFileBeforeDownloadAndSucceedsAfterCleanup(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	fixture := newPendingPullFixture(t, "repo-phase25-untracked")
	ledgerBefore := readFile(t, filepath.Join(fixture.device2, ".gitfuse", "ledger"))
	headBefore := strings.TrimSpace(testGitOutput(t, fixture.device2, "rev-parse", "HEAD"))
	dirtyPath := filepath.Join(fixture.device2, "dirty-device2-phase25.txt")
	if err := os.WriteFile(dirtyPath, []byte("device 2 scratch\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var dirtyOutput bytes.Buffer
	dirtyErr := runCommandInDir(t, fixture.device2, &dirtyOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if dirtyErr == nil {
		t.Fatal("untracked dirty pull succeeded")
	}
	if !strings.Contains(dirtyErr.Error(), "untracked files") {
		t.Fatalf("dirty pull error = %q, want untracked refusal", dirtyErr.Error())
	}
	if strings.Contains(dirtyOutput.String(), "No new commits to pull.") || strings.Contains(dirtyOutput.String(), "Pulled") {
		t.Fatalf("dirty pull printed success/no-op output: %q", dirtyOutput.String())
	}
	if got := totalDownloadCalls(fixture.relay); got != 0 {
		t.Fatalf("dirty pull downloaded %d bundle payload(s), want 0", got)
	}
	assertRestoredHead(t, fixture.device2, headBefore)
	if headBefore != fixture.baseHead {
		t.Fatalf("HEAD before dirty pull = %s, want base %s", headBefore, fixture.baseHead)
	}
	if ledgerAfter := readFile(t, filepath.Join(fixture.device2, ".gitfuse", "ledger")); ledgerAfter != ledgerBefore {
		t.Fatalf("dirty pull changed ledger\nbefore:\n%s\nafter:\n%s", ledgerBefore, ledgerAfter)
	}
	if present, err := commitExists(fixture.device2, fixture.remoteHead); err != nil {
		t.Fatal(err)
	} else if present {
		t.Fatalf("dirty pull imported remote commit object %s", fixture.remoteHead)
	}
	if _, err := os.Stat(filepath.Join(fixture.device2, fixture.remoteFile)); !os.IsNotExist(err) {
		t.Fatalf("dirty pull created %s, stat err = %v", fixture.remoteFile, err)
	}

	if err := os.Remove(dirtyPath); err != nil {
		t.Fatal(err)
	}
	var cleanOutput bytes.Buffer
	if err := runCommandInDir(t, fixture.device2, &cleanOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cleanOutput.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("clean pull output = %q, want fast-forward", cleanOutput.String())
	}
	if fixture.relay.downloadCalls[fixture.remoteBundleID] != 1 {
		t.Fatalf("remote bundle downloads = %d, want 1", fixture.relay.downloadCalls[fixture.remoteBundleID])
	}
	assertRestoredHead(t, fixture.device2, fixture.remoteHead)
	assertFileContent(t, fixture.device2, fixture.remoteFile, "remote phase 25\n")
	ledger, err := workspace.ReadLedger(fixture.device2)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != fixture.remoteHead {
		t.Fatalf("clean pull ledger synced head = %s, want %s", ledger.SyncedHead, fixture.remoteHead)
	}
	if ledger.PreviousSyncedHead != fixture.baseHead {
		t.Fatalf("clean pull ledger previous synced head = %s, want %s", ledger.PreviousSyncedHead, fixture.baseHead)
	}
	assertCleanWorktree(t, fixture.device2)
	assertGitfuseNotTrackedOrStaged(t, fixture.device2)
}

func TestPullAllowsIgnoredUntrackedFiles(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	fixture := newPendingPullFixture(t, "repo-phase25-ignored")
	excludePath := filepath.Join(fixture.device2, ".git", "info", "exclude")
	excludeFile, err := os.OpenFile(excludePath, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := excludeFile.WriteString("\nignored-device2-phase25.txt\n"); err != nil {
		_ = excludeFile.Close()
		t.Fatal(err)
	}
	if err := excludeFile.Close(); err != nil {
		t.Fatal(err)
	}
	ignoredPath := filepath.Join(fixture.device2, "ignored-device2-phase25.txt")
	if err := os.WriteFile(ignoredPath, []byte("ignored scratch\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if status := strings.TrimSpace(testGitOutput(t, fixture.device2, "status", "--porcelain")); status != "" {
		t.Fatalf("git status = %q, want ignored file hidden", status)
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, fixture.device2, &output, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("pull output = %q, want fast-forward", output.String())
	}
	if fixture.relay.downloadCalls[fixture.remoteBundleID] != 1 {
		t.Fatalf("remote bundle downloads = %d, want 1", fixture.relay.downloadCalls[fixture.remoteBundleID])
	}
	assertRestoredHead(t, fixture.device2, fixture.remoteHead)
	assertFileContent(t, fixture.device2, fixture.remoteFile, "remote phase 25\n")
	if _, err := os.Stat(ignoredPath); err != nil {
		t.Fatalf("ignored file missing after pull: %v", err)
	}
	assertCleanWorktree(t, fixture.device2)
	assertGitfuseNotTrackedOrStaged(t, fixture.device2)
}

func TestPullNonFastForwardDoesNotAdvanceLedgerBeyondReachableHead(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "file1.txt", "one\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	base := commitPullFile(t, device1, "file4.txt", "phase 18\n", "device 2 phase 18 commit", time.Unix(2, 0))
	baseBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")

	localCommit := commitPullFile(t, device1, "file5-device1.txt", "device 1 local\n", "device 1 phase 19 local commit", time.Unix(3, 0))
	remoteCommit := commitPullFile(t, device2, "file5-device2.txt", "device 2 remote\n", "device 2 phase 19 remote commit", time.Unix(4, 0))
	remoteBundle := mustCreatePullBundle(t, device2, base)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-phase19-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-phase19",
		RemoteURL:    "",
		RelayEntryID: "repo-phase19-relay",
	})
	relay.addBundle(relay.repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(relay.repo.RelayEntryID, "bundle-base", "device-2", baseBundle, time.Unix(20, 0))
	relay.addBundle(relay.repo.RelayEntryID, "bundle-remote", "device-2", remoteBundle, time.Unix(30, 0))
	installPullRelayTransport(t, relay)
	writePullMetadata(t, device1, relay.repo, base, initial)

	var output bytes.Buffer
	err := runCommandInDir(t, device1, &output, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if err == nil {
		t.Fatal("non-fast-forward pull succeeded")
	}
	if !strings.Contains(err.Error(), nonFastForwardPullMessage) {
		t.Fatalf("pull error = %q, want non-fast-forward refusal", err.Error())
	}
	if strings.Contains(output.String(), "Pulled") || strings.Contains(output.String(), "branch unchanged because non-fast-forward") {
		t.Fatalf("pull printed success-style output: %q", output.String())
	}
	if present, err := commitExists(device1, remoteCommit); err != nil {
		t.Fatal(err)
	} else if !present {
		t.Fatalf("remote divergent commit %s was not imported", remoteCommit)
	}
	assertRestoredHead(t, device1, localCommit)
	if reachable, err := commitReachableFrom(device1, remoteCommit, localCommit); err != nil {
		t.Fatal(err)
	} else if reachable {
		t.Fatalf("remote commit %s unexpectedly reachable from local HEAD %s", remoteCommit, localCommit)
	}
	ledger, err := workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != base {
		t.Fatalf("ledger synced head = %s, want reachable base %s", ledger.SyncedHead, base)
	}
	if ledger.SyncedHead == remoteCommit {
		t.Fatalf("ledger advanced to remote divergent commit %s", remoteCommit)
	}
	if _, err := os.Stat(filepath.Join(device1, "file5-device2.txt")); !os.IsNotExist(err) {
		t.Fatalf("remote divergent file appeared in worktree, stat err = %v", err)
	}
	assertFileContent(t, device1, "file5-device1.txt", "device 1 local\n")
	assertCleanWorktree(t, device1)
	assertGitfuseNotTrackedOrStaged(t, device1)

	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 1") {
		t.Fatalf("status output = %q, want one commit ahead", statusOutput.String())
	}

	var logOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &logOutput, func(cmd *cobra.Command) error {
		return runLog(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	assertLogContains(t, logOutput.String(), "local-only", localCommit, "device 1 phase 19 local commit")
	assertLogContains(t, logOutput.String(), "synced", base, "device 2 phase 18 commit")
	if strings.Contains(logOutput.String(), shortLogSHA(remoteCommit)) {
		t.Fatalf("log output included unreachable remote commit %s:\n%s", remoteCommit, logOutput.String())
	}

	var existingObjectOutput bytes.Buffer
	existingObjectErr := runCommandInDir(t, device1, &existingObjectOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if existingObjectErr == nil {
		t.Fatal("non-fast-forward pull with pre-existing remote object succeeded")
	}
	if !strings.Contains(existingObjectErr.Error(), nonFastForwardPullMessage) {
		t.Fatalf("pre-existing object pull error = %q, want non-fast-forward refusal", existingObjectErr.Error())
	}
	if strings.Contains(existingObjectOutput.String(), "Pulled") || strings.Contains(existingObjectOutput.String(), "branch unchanged because non-fast-forward") {
		t.Fatalf("pre-existing object pull printed success-style output: %q", existingObjectOutput.String())
	}
	assertRestoredHead(t, device1, localCommit)
	ledger, err = workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != base {
		t.Fatalf("pre-existing object pull ledger synced head = %s, want %s", ledger.SyncedHead, base)
	}

	if _, err := workspace.WriteLedger(device1, workspace.Ledger{
		SyncedHead:         remoteCommit,
		PreviousSyncedHead: base,
	}); err != nil {
		t.Fatal(err)
	}
	var repairedStatus bytes.Buffer
	if err := runCommandInDir(t, device1, &repairedStatus, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(repairedStatus.String(), "Commits ahead: 1") {
		t.Fatalf("repaired status output = %q, want one commit ahead", repairedStatus.String())
	}
	ledger, err = workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != base {
		t.Fatalf("repaired ledger synced head = %s, want %s", ledger.SyncedHead, base)
	}
	if ledger.PreviousSyncedHead != "" {
		t.Fatalf("repaired ledger previous synced head = %s, want empty", ledger.PreviousSyncedHead)
	}
}

func TestPullEmptyRepositoryTellsUserToRestore(t *testing.T) {
	repoPath := t.TempDir()
	testGit(t, "", "init", repoPath)

	err := runCommandInDir(t, repoPath, nil, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if err == nil {
		t.Fatal("empty repository pull succeeded")
	}
	if !strings.Contains(err.Error(), "use 'gitfuse restore <relay-entry-name>'") {
		t.Fatalf("error = %q, want restore guidance", err.Error())
	}
}

func TestPullMissingPayloadDoesNotReportSuccessOrUpdateLedger(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://pull.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	second := commitPullFile(t, device2, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, device2, initial)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-missing-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-missing",
		RemoteURL:    "",
		RelayEntryID: "repo-missing-relay",
	})
	relay.addBundle("repo-missing-relay", "bundle-missing", "device-2", secondBundle, time.Unix(10, 0))
	relay.missingPayloads["bundle-missing"] = true
	installPullRelayTransport(t, relay)
	writePullMetadata(t, device1, relay.repo, initial, "")

	var output bytes.Buffer
	err := runCommandInDir(t, device1, &output, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	})
	if err == nil {
		t.Fatal("pull succeeded with missing payload")
	}
	if !strings.Contains(err.Error(), "payload is unavailable") {
		t.Fatalf("error = %q, want missing payload message", err.Error())
	}
	if strings.Contains(output.String(), "Pulled") || strings.Contains(output.String(), "Pull complete") {
		t.Fatalf("pull printed success on missing payload: %q", output.String())
	}
	if present, err := commitExists(device1, second); err != nil {
		t.Fatal(err)
	} else if present {
		t.Fatalf("device 1 imported %s despite missing payload", second)
	}
	ledger, err := workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != initial {
		t.Fatalf("ledger synced head = %s, want unchanged %s", ledger.SyncedHead, initial)
	}
}

func TestReachableRelayHeadWithMissingPayloadNoopsAndRepairsLedger(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase22.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	second := commitPullFile(t, repoPath, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, repoPath, initial)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-phase22-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-phase22",
		RemoteURL:    "",
		RelayEntryID: "repo-phase22-relay",
	})
	relay.addBundle(relay.repo.RelayEntryID, "bundle-second", "device-1", secondBundle, time.Unix(10, 0))
	relay.missingPayloads["bundle-second"] = true
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)

	resetBehindLedger := func() {
		t.Helper()
		writePullMetadata(t, repoPath, relay.repo, initial, "")
	}
	assertLedgerRepaired := func(context string) {
		t.Helper()
		ledger, err := workspace.ReadLedger(repoPath)
		if err != nil {
			t.Fatal(err)
		}
		if ledger.SyncedHead != second {
			t.Fatalf("%s ledger synced head = %s, want %s", context, ledger.SyncedHead, second)
		}
		if ledger.PreviousSyncedHead != initial {
			t.Fatalf("%s ledger previous synced head = %s, want %s", context, ledger.PreviousSyncedHead, initial)
		}
	}

	resetBehindLedger()
	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("status output = %q, want zero commits ahead", statusOutput.String())
	}
	assertLedgerRepaired("status")

	resetBehindLedger()
	var logOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &logOutput, func(cmd *cobra.Command) error {
		return runLog(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	assertLogContains(t, logOutput.String(), "synced", second, "second commit")
	if strings.Contains(logOutput.String(), "local-only") {
		t.Fatalf("log output showed local-only commits despite reachable relay head:\n%s", logOutput.String())
	}
	assertLedgerRepaired("log")

	resetBehindLedger()
	var pullOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &pullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pullOutput.String(), "No new commits to pull.") {
		t.Fatalf("pull output = %q, want no-op", pullOutput.String())
	}
	assertLedgerRepaired("pull")

	resetBehindLedger()
	upload.calls = 0
	var syncOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &syncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(syncOutput.String(), "No commits to sync.") {
		t.Fatalf("sync output = %q, want no-op", syncOutput.String())
	}
	if upload.calls != 0 {
		t.Fatalf("sync upload calls = %d, want 0", upload.calls)
	}
	assertLedgerRepaired("sync")
	assertRestoredHead(t, repoPath, second)
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestLegacyRelayMissingPayloadNoopsWhenLedgerHeadIsCurrent(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase22-legacy.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	second := commitPullFile(t, repoPath, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, repoPath, initial)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-legacy-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-legacy",
		RemoteURL:    "",
		RelayEntryID: "repo-legacy-relay",
	})
	relay.addLegacyBundle(relay.repo.RelayEntryID, "bundle-legacy", "device-1", secondBundle, time.Unix(10, 0))
	relay.missingPayloads["bundle-legacy"] = true
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, repoPath, relay.repo, second, initial)

	var pullOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &pullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pullOutput.String(), "No new commits to pull.") {
		t.Fatalf("pull output = %q, want no-op", pullOutput.String())
	}

	var syncOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &syncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(syncOutput.String(), "No commits to sync.") {
		t.Fatalf("sync output = %q, want no-op", syncOutput.String())
	}
	if upload.calls != 0 {
		t.Fatalf("sync upload calls = %d, want 0", upload.calls)
	}
	assertRestoredHead(t, repoPath, second)
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestLegacyRelayMissingPayloadRepairsStalePulledLedgerWithoutFalseSync(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase22-device2.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "device2", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	base := commitPullFile(t, repoPath, "file4.txt", "phase 18\n", "device 2 phase 18 commit", time.Unix(2, 0))
	remote := commitPullFile(t, repoPath, "file5-device2.txt", "device 2 remote\n", "device 2 phase 19 remote commit", time.Unix(3, 0))
	resolved := commitPullFile(t, repoPath, "file5-device1.txt", "device 1 local\n", "device 1 phase 19 local commit", time.Unix(4, 0))
	resolvedBundle := mustCreatePullBundle(t, repoPath, base)
	lastPullAt := time.Unix(20, 0).UTC().Format(time.RFC3339)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-device2-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-device2",
		RemoteURL:    "",
		RelayEntryID: "repo-device2-relay",
	})
	relay.addLegacyBundle(relay.repo.RelayEntryID, "bundle-resolved-legacy", "device-1", resolvedBundle, time.Unix(10, 0))
	relay.missingPayloads["bundle-resolved-legacy"] = true
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)

	resetStaleLedger := func() {
		t.Helper()
		if _, err := config.WriteLocalConfig(repoPath, config.LocalConfig{
			RootSHA:      relay.repo.RootSHA,
			RelayEntryID: relay.repo.RelayEntryID,
			Account:      "tester",
			DisplayName:  relay.repo.DisplayName,
			RemoteURL:    relay.repo.RemoteURL,
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{
			SyncedHead: base,
			LastPullAt: lastPullAt,
		}); err != nil {
			t.Fatal(err)
		}
	}
	assertLedgerResolved := func(context string) {
		t.Helper()
		ledger, err := workspace.ReadLedger(repoPath)
		if err != nil {
			t.Fatal(err)
		}
		if ledger.SyncedHead != resolved {
			t.Fatalf("%s ledger synced head = %s, want %s", context, ledger.SyncedHead, resolved)
		}
		if ledger.PreviousSyncedHead != base {
			t.Fatalf("%s ledger previous synced head = %s, want %s", context, ledger.PreviousSyncedHead, base)
		}
	}

	resetStaleLedger()
	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("status output = %q, want zero ahead", statusOutput.String())
	}
	assertLedgerResolved("status")

	resetStaleLedger()
	var logOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &logOutput, func(cmd *cobra.Command) error {
		return runLog(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	assertLogContains(t, logOutput.String(), "synced", resolved, "device 1 phase 19 local commit")
	assertLogContains(t, logOutput.String(), "synced", remote, "device 2 phase 19 remote commit")
	if strings.Contains(logOutput.String(), "local-only") {
		t.Fatalf("log output showed local-only commits despite repaired legacy pull state:\n%s", logOutput.String())
	}
	assertLedgerResolved("log")

	resetStaleLedger()
	var pullOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &pullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pullOutput.String(), "No new commits to pull.") {
		t.Fatalf("pull output = %q, want no-op", pullOutput.String())
	}
	assertLedgerResolved("pull")

	resetStaleLedger()
	upload.calls = 0
	var syncOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &syncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(syncOutput.String(), "No commits to sync.") {
		t.Fatalf("sync output = %q, want no-op", syncOutput.String())
	}
	if upload.calls != 0 {
		t.Fatalf("sync upload calls = %d, want 0", upload.calls)
	}
	assertLedgerResolved("sync")
	assertRestoredHead(t, repoPath, resolved)
	assertFileContent(t, repoPath, "file5-device1.txt", "device 1 local\n")
	assertFileContent(t, repoPath, "file5-device2.txt", "device 2 remote\n")
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestPullSkipsUnavailableLegacyRowsAndFastForwardsNewMetadataBundle(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase23.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	oldSynced := commitPullFile(t, device1, "file5-device1.txt", "device 1 old\n", "device 1 old synced commit", time.Unix(2, 0))
	oldBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	if err := excludeGitfuseMetadata(device2); err != nil {
		t.Fatal(err)
	}

	newCommit := commitPullFile(t, device1, "file6-device1-phase23.txt", "phase 23\n", "device 1 phase 23 commit", time.Unix(3, 0))
	newBundle := mustCreatePullBundle(t, device1, oldSynced)

	relay := newPullRelayFixture(relayRepository{
		ID:           "repo-phase23-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  "repo-phase23",
		RemoteURL:    "",
		RelayEntryID: "repo-phase23-relay",
	})
	relay.addLegacyBundle(relay.repo.RelayEntryID, "bundle-initial-legacy", "device-1", initialBundle, time.Unix(10, 0))
	relay.addLegacyBundle(relay.repo.RelayEntryID, "bundle-old-legacy", "device-1", oldBundle, time.Unix(20, 0))
	relay.addBundle(relay.repo.RelayEntryID, "bundle-phase23", "device-1", newBundle, time.Unix(30, 0))
	relay.missingPayloads["bundle-initial-legacy"] = true
	relay.missingPayloads["bundle-old-legacy"] = true
	installPullRelayTransport(t, relay)
	writePullMetadata(t, device2, relay.repo, oldSynced, initial)

	var output bytes.Buffer
	if err := runCommandInDir(t, device2, &output, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("pull output = %q, want fast-forward", output.String())
	}
	if relay.downloadCalls["bundle-initial-legacy"] != 0 || relay.downloadCalls["bundle-old-legacy"] != 0 {
		t.Fatalf("legacy downloads = initial:%d old:%d, want both 0", relay.downloadCalls["bundle-initial-legacy"], relay.downloadCalls["bundle-old-legacy"])
	}
	if relay.downloadCalls["bundle-phase23"] != 1 {
		t.Fatalf("phase23 download calls = %d, want 1", relay.downloadCalls["bundle-phase23"])
	}
	assertRestoredHead(t, device2, newCommit)
	assertFileContent(t, device2, "file6-device1-phase23.txt", "phase 23\n")
	assertFileMatchesHEAD(t, device2, "file6-device1-phase23.txt")
	ledger, err := workspace.ReadLedger(device2)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != newCommit {
		t.Fatalf("ledger synced head = %s, want %s", ledger.SyncedHead, newCommit)
	}
	if ledger.PreviousSyncedHead != oldSynced {
		t.Fatalf("ledger previous synced head = %s, want %s", ledger.PreviousSyncedHead, oldSynced)
	}
	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, device2, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("status output = %q, want zero ahead", statusOutput.String())
	}
	assertCleanWorktree(t, device2)
	assertGitfuseNotTrackedOrStaged(t, device2)
}

type pendingPullFixture struct {
	device2        string
	relay          *pullRelayFixture
	baseHead       string
	remoteHead     string
	remoteFile     string
	remoteBundleID string
}

func newPendingPullFixture(t *testing.T, repoName string) pendingPullFixture {
	t.Helper()

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	if err := excludeGitfuseMetadata(device2); err != nil {
		t.Fatal(err)
	}

	remoteFile := "remote-device1-phase25.txt"
	remoteHead := commitPullFile(t, device1, remoteFile, "remote phase 25\n", "device 1 phase 25 commit", time.Unix(2, 0))
	remoteBundle := mustCreatePullBundle(t, device1, initial)
	relay := newPullRelayFixture(relayRepository{
		ID:           repoName + "-id",
		UserID:       "user-id",
		RootSHA:      initial,
		DisplayName:  repoName,
		RemoteURL:    "",
		RelayEntryID: repoName + "-relay",
	})
	remoteBundleID := "bundle-device1-phase25"
	relay.addBundle(relay.repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(relay.repo.RelayEntryID, remoteBundleID, "device-1", remoteBundle, time.Unix(20, 0))
	installPullRelayTransport(t, relay)
	writePullMetadata(t, device2, relay.repo, initial, "")

	return pendingPullFixture{
		device2:        device2,
		relay:          relay,
		baseHead:       initial,
		remoteHead:     remoteHead,
		remoteFile:     remoteFile,
		remoteBundleID: remoteBundleID,
	}
}

func totalDownloadCalls(fixture *pullRelayFixture) int {
	total := 0
	for _, calls := range fixture.downloadCalls {
		total += calls
	}
	return total
}

type pullRelayFixture struct {
	repo            relayRepository
	repos           map[string]relayRepository
	bundles         map[string][]pullRelayBundle
	missingPayloads map[string]bool
	downloadCalls   map[string]int
}

type pullRelayBundle struct {
	row     relayBundleRow
	payload []byte
}

func newPullRelayFixture(repo relayRepository) *pullRelayFixture {
	return &pullRelayFixture{
		repo:            repo,
		repos:           map[string]relayRepository{repo.RelayEntryID: repo},
		bundles:         make(map[string][]pullRelayBundle),
		missingPayloads: make(map[string]bool),
		downloadCalls:   make(map[string]int),
	}
}

func (fixture *pullRelayFixture) addBundle(relayEntryID, id, deviceID string, bundle gfgit.BundlePayload, createdAt time.Time) {
	repo := fixture.repos[relayEntryID]
	fixture.bundles[relayEntryID] = append(fixture.bundles[relayEntryID], pullRelayBundle{
		row: relayBundleRow{
			ID:             id,
			RepositoryID:   repo.ID,
			DeviceID:       deviceID,
			BundleHash:     bundle.SHA256,
			CommitCount:    len(bundle.Manifest.Commits),
			SizeBytes:      int64(len(bundle.Bytes)),
			R2Key:          repo.UserID + "/" + relayEntryID + "/" + id + ".bundle.enc",
			Status:         "active",
			ParentBundleID: "",
			CreatedAt:      createdAt.UTC().Format(time.RFC3339),
			ExpiresAt:      time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
			HeadSHA:        bundle.Manifest.HeadSHA,
			Commits:        relayBundleRowCommits(bundle.Manifest.Commits),
		},
		payload: bundle.Bytes,
	})
}

func (fixture *pullRelayFixture) addLegacyBundle(relayEntryID, id, deviceID string, bundle gfgit.BundlePayload, createdAt time.Time) {
	fixture.addBundle(relayEntryID, id, deviceID, bundle, createdAt)
	bundles := fixture.bundles[relayEntryID]
	index := len(bundles) - 1
	bundles[index].row.HeadSHA = ""
	bundles[index].row.HeadSHAUpper = ""
	bundles[index].row.HeadSHASnake = ""
	bundles[index].row.Commits = nil
	fixture.bundles[relayEntryID] = bundles
}

func relayBundleRowCommits(commits []gfgit.BundleCommit) []relayBundleCommitRow {
	rows := make([]relayBundleCommitRow, 0, len(commits))
	for _, commit := range commits {
		rows = append(rows, relayBundleCommitRow{SHA: commit.SHA})
	}
	return rows
}

func installPullRelayTransport(t *testing.T, fixture *pullRelayFixture) {
	t.Helper()
	previousClient := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: newPullRelayTransport(t, fixture)}
	t.Cleanup(func() {
		http.DefaultClient = previousClient
	})
}

func newPullRelayTransport(t *testing.T, fixture *pullRelayFixture) http.RoundTripper {
	t.Helper()
	return restoreRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("authorization") != "Bearer pull-token" {
			return restoreJSONResponse(http.StatusUnauthorized, map[string]string{"error": "missing auth"}), nil
		}
		if r.URL.Path == "/v1/repos" {
			repos := make([]relayRepository, 0, len(fixture.repos))
			for _, repo := range fixture.repos {
				repos = append(repos, repo)
			}
			return restoreJSONResponse(http.StatusOK, map[string]any{"repositories": repos}), nil
		}
		if strings.HasPrefix(r.URL.Path, "/v1/bundles/") && strings.HasSuffix(r.URL.Path, "/download") {
			bundleID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/bundles/"), "/download")
			fixture.downloadCalls[bundleID]++
			if fixture.missingPayloads[bundleID] {
				return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "missing"}), nil
			}
			for _, bundles := range fixture.bundles {
				for _, bundle := range bundles {
					if bundle.row.ID == bundleID {
						return &http.Response{
							StatusCode: http.StatusOK,
							Header: http.Header{
								"content-type":          []string{"application/octet-stream"},
								"x-gitfuse-bundle-hash": []string{bundle.row.BundleHash},
							},
							Body: io.NopCloser(bytes.NewReader(bundle.payload)),
						}, nil
					}
				}
			}
			return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
		}
		if strings.HasPrefix(r.URL.Path, "/v1/bundles/") {
			relayEntryID := strings.TrimPrefix(r.URL.Path, "/v1/bundles/")
			return restoreJSONResponse(http.StatusOK, map[string]any{"bundles": rowsForPullBundles(fixture.bundles[relayEntryID])}), nil
		}
		return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
	})
}

func rowsForPullBundles(bundles []pullRelayBundle) []relayBundleRow {
	rows := make([]relayBundleRow, 0, len(bundles))
	for _, bundle := range bundles {
		rows = append(rows, bundle.row)
	}
	return rows
}

func runCommandInDir(t *testing.T, dir string, output *bytes.Buffer, fn func(*cobra.Command) error) error {
	t.Helper()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := os.Chdir(previous); err != nil {
			t.Fatal(err)
		}
	}()

	cmd := &cobra.Command{}
	cmd.SetIn(strings.NewReader("yes\n"))
	if output != nil {
		cmd.SetOut(output)
	}
	return fn(cmd)
}

func newPullGitRepo(t *testing.T, name, branch string) string {
	t.Helper()
	repoPath := filepath.Join(t.TempDir(), name)
	testGit(t, "", "init", repoPath)
	testGit(t, repoPath, "checkout", "-b", branch)
	configureTestGitIdentity(t, repoPath)
	if err := excludeGitfuseMetadata(repoPath); err != nil {
		t.Fatal(err)
	}
	return repoPath
}

func configureTestGitIdentity(t *testing.T, repoPath string) {
	t.Helper()
	testGit(t, repoPath, "config", "user.email", "gitfuse-ci@example.com")
	testGit(t, repoPath, "config", "user.name", "GitFuse CI")
}

func commitPullFile(t *testing.T, repoPath, name, content, message string, when time.Time) string {
	t.Helper()
	path := filepath.Join(repoPath, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	testGit(t, repoPath, "add", ".")
	stamp := when.UTC().Format(time.RFC3339)
	testGitEnv(t, repoPath, []string{
		"GIT_AUTHOR_DATE=" + stamp,
		"GIT_COMMITTER_DATE=" + stamp,
	}, "commit", "-m", message)
	return strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD"))
}

func mustCreatePullBundle(t *testing.T, repoPath, syncedHead string) gfgit.BundlePayload {
	t.Helper()
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, syncedHead)
	if err != nil {
		t.Fatal(err)
	}
	return bundle
}

func importBundleObjectWithoutBranchUpdate(t *testing.T, repoPath string, bundle gfgit.BundlePayload) {
	t.Helper()
	native, err := base64.StdEncoding.DecodeString(bundle.Manifest.GitBundleBase64)
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeTempNativeBundle(native)
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)

	testGit(t, repoPath, "bundle", "verify", path)
	heads, err := listNativeBundleHeads(repoPath, path)
	if err != nil {
		t.Fatal(err)
	}
	sourceRef, sourceHead, err := chooseRestoreBundleHead(bundle.Manifest, heads)
	if err != nil {
		t.Fatal(err)
	}
	tempRef := "refs/gitfuse/test-partial-import"
	testGit(t, repoPath, "fetch", "--force", path, sourceRef+":"+tempRef)
	if sourceHead != "" {
		importedHead := strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "--verify", tempRef+"^{commit}"))
		if importedHead != sourceHead {
			t.Fatalf("partial import head = %s, want %s", importedHead, sourceHead)
		}
	}
	testGit(t, repoPath, "update-ref", "-d", tempRef)
}

func assertLogContains(t *testing.T, output, state, sha, message string) {
	t.Helper()
	want := state + "\t" + shortLogSHA(sha) + "\t" + message
	if !strings.Contains(output, want) {
		t.Fatalf("log output missing %q:\n%s", want, output)
	}
}

func writePullMetadata(t *testing.T, repoPath string, repo relayRepository, syncedHead, previousSyncedHead string) {
	t.Helper()
	if _, err := config.WriteLocalConfig(repoPath, config.LocalConfig{
		RootSHA:      repo.RootSHA,
		RelayEntryID: repo.RelayEntryID,
		Account:      "tester",
		DisplayName:  repo.DisplayName,
		RemoteURL:    repo.RemoteURL,
		Platform:     "",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{
		SyncedHead:         syncedHead,
		PreviousSyncedHead: previousSyncedHead,
	}); err != nil {
		t.Fatal(err)
	}
}
