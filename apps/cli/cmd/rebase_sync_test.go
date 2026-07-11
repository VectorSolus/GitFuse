package cmd

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

func TestRebaseSyncImportsRemoteHeadAndRebasesDivergentLocalCommit(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase36.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	base := commitPullFile(t, device1, "base.txt", "base\n", "phase 36 shared base", time.Unix(2, 0))
	baseBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	if err := excludeGitfuseMetadata(device2); err != nil {
		t.Fatal(err)
	}

	repo := syncRelayRepository("repo-phase36", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-base", "device-1", baseBundle, time.Unix(20, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, device1, repo, base, initial)
	writePullMetadata(t, device2, repo, base, initial)

	remoteCommit := commitPullFile(t, device1, "remote.txt", "remote\n", "phase 36 remote before rebase", time.Unix(3, 0))
	remoteBundle := mustCreatePullBundle(t, device1, base)
	relay.addBundle(repo.RelayEntryID, "bundle-remote", "device-1", remoteBundle, time.Unix(30, 0))
	localCommit := commitPullFile(t, device2, "local.txt", "local\n", "phase 36 local rebase sync", time.Unix(4, 0))

	if present, err := commitExists(device2, remoteCommit); err != nil {
		t.Fatal(err)
	} else if present {
		t.Fatalf("device 2 unexpectedly had remote commit %s before rebase-sync", remoteCommit)
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, device2, &output, func(cmd *cobra.Command) error {
		return runRebaseSync(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(output.String(), "No rewritten history detected.") {
		t.Fatalf("rebase-sync output incorrectly no-oped: %q", output.String())
	}
	if !strings.Contains(output.String(), "Rebased 1 commit(s) onto relay head.") {
		t.Fatalf("rebase-sync output = %q, want rebase message", output.String())
	}
	if !strings.Contains(output.String(), "Synced 1 commit(s).") {
		t.Fatalf("rebase-sync output = %q, want sync message", output.String())
	}
	if relay.downloadCalls["bundle-remote"] != 1 {
		t.Fatalf("remote bundle downloads = %d, want 1", relay.downloadCalls["bundle-remote"])
	}
	if upload.calls != 1 {
		t.Fatalf("relay upload calls = %d, want 1", upload.calls)
	}
	if upload.fields["commitCount"] != "1" {
		t.Fatalf("upload commitCount = %q, want 1", upload.fields["commitCount"])
	}

	rebasedCommit := strings.TrimSpace(testGitOutput(t, device2, "rev-parse", "HEAD"))
	if rebasedCommit == localCommit {
		t.Fatal("rebase-sync did not rewrite the divergent local commit")
	}
	if reachable, err := commitReachableFrom(device2, remoteCommit, rebasedCommit); err != nil {
		t.Fatal(err)
	} else if !reachable {
		t.Fatalf("remote commit %s is not reachable from rebased HEAD %s", remoteCommit, rebasedCommit)
	}
	if reachable, err := commitReachableFrom(device2, localCommit, rebasedCommit); err != nil {
		t.Fatal(err)
	} else if reachable {
		t.Fatalf("old local commit %s unexpectedly reachable from rebased HEAD %s", localCommit, rebasedCommit)
	}
	assertFileContent(t, device2, "remote.txt", "remote\n")
	assertFileContent(t, device2, "local.txt", "local\n")

	rebasedBundle := uploadedBundlePayload(t, upload)
	if got := len(rebasedBundle.Manifest.Commits); got != 1 {
		t.Fatalf("uploaded bundle commits = %d, want 1", got)
	}
	if rebasedBundle.Manifest.Commits[0].SHA != rebasedCommit {
		t.Fatalf("uploaded bundle commit = %s, want %s", rebasedBundle.Manifest.Commits[0].SHA, rebasedCommit)
	}
	if rebasedBundle.Manifest.HeadSHA != rebasedCommit {
		t.Fatalf("uploaded bundle head = %s, want %s", rebasedBundle.Manifest.HeadSHA, rebasedCommit)
	}
	ledger, err := workspace.ReadLedger(device2)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != rebasedCommit {
		t.Fatalf("device 2 ledger synced head = %s, want %s", ledger.SyncedHead, rebasedCommit)
	}

	relay.addBundle(repo.RelayEntryID, "bundle-rebased", "device-2", rebasedBundle, time.Unix(40, 0))
	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, device2, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("status output = %q, want zero commits ahead", statusOutput.String())
	}

	var pullOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &pullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pullOutput.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("device 1 pull output = %q, want fast-forward", pullOutput.String())
	}
	assertRestoredHead(t, device1, rebasedCommit)
	assertFileContent(t, device1, "remote.txt", "remote\n")
	assertFileContent(t, device1, "local.txt", "local\n")
	logSubjects := testGitOutput(t, device1, "log", "--format=%s")
	if !strings.Contains(logSubjects, "phase 36 remote before rebase") {
		t.Fatalf("device 1 history missing remote commit:\n%s", logSubjects)
	}
	if !strings.Contains(logSubjects, "phase 36 local rebase sync") {
		t.Fatalf("device 1 history missing rebased local commit:\n%s", logSubjects)
	}
	assertCleanWorktree(t, device1)
	assertCleanWorktree(t, device2)
	assertGitfuseNotTrackedOrStaged(t, device1)
	assertGitfuseNotTrackedOrStaged(t, device2)
}

func TestRebaseSyncNoopsWhenFullySynced(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://rebase-noop.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "repo", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, repoPath, "")
	repo := syncRelayRepository("repo-rebase-noop", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, repoPath, repo, initial, "")

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runRebaseSync(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "No rewritten history detected.") {
		t.Fatalf("rebase-sync output = %q, want no-op", output.String())
	}
	if upload.calls != 0 {
		t.Fatalf("relay upload calls = %d, want 0", upload.calls)
	}
	if relay.downloadCalls["bundle-initial"] != 0 {
		t.Fatalf("bundle downloads = %d, want 0", relay.downloadCalls["bundle-initial"])
	}
	assertCleanWorktree(t, repoPath)
}

func TestRebaseSyncRefusesDirtyWorktree(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://rebase-dirty.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "repo", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, repoPath, "")
	repo := syncRelayRepository("repo-rebase-dirty", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, repoPath, repo, initial, "")
	if err := os.WriteFile(filepath.Join(repoPath, "dirty.txt"), []byte("dirty\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runRebaseSync(context.Background(), cmd)
	})
	if err == nil {
		t.Fatal("dirty rebase-sync succeeded")
	}
	if !strings.Contains(err.Error(), "working tree has local changes") {
		t.Fatalf("dirty rebase-sync error = %q, want dirty-worktree refusal", err.Error())
	}
	if strings.Contains(output.String(), "Synced") || strings.Contains(output.String(), "No rewritten history detected.") {
		t.Fatalf("dirty rebase-sync printed success/no-op output: %q", output.String())
	}
	if upload.calls != 0 {
		t.Fatalf("relay upload calls = %d, want 0", upload.calls)
	}
	if relay.downloadCalls["bundle-initial"] != 0 {
		t.Fatalf("bundle downloads = %d, want 0", relay.downloadCalls["bundle-initial"])
	}
}

func TestRebaseSyncPreservesSupersedingRewrite(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://rebase-rewrite.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	repoPath := newPullGitRepo(t, "repo", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, repoPath, "")
	second := commitPullFile(t, repoPath, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, repoPath, initial)
	repo := syncRelayRepository("repo-rebase-rewrite", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-second", "device-1", secondBundle, time.Unix(20, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, repoPath, repo, second, initial)

	if err := os.WriteFile(filepath.Join(repoPath, "app.txt"), []byte("rewritten\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	testGit(t, repoPath, "add", "app.txt")
	stamp := time.Unix(3, 0).UTC().Format(time.RFC3339)
	testGitEnv(t, repoPath, []string{
		"GIT_AUTHOR_DATE=" + stamp,
		"GIT_COMMITTER_DATE=" + stamp,
	}, "commit", "--amend", "-m", "rewritten second commit")
	rewritten := strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD"))
	if rewritten == second {
		t.Fatal("amend did not rewrite the synced commit")
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runRebaseSync(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "History rewrite detected. Uploaded superseding bundle") {
		t.Fatalf("rebase-sync output = %q, want superseding rewrite message", output.String())
	}
	if upload.calls != 1 {
		t.Fatalf("relay upload calls = %d, want 1", upload.calls)
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != rewritten {
		t.Fatalf("ledger synced head = %s, want %s", ledger.SyncedHead, rewritten)
	}
	if _, err := os.Stat(filepath.Join(repoPath, ".gitfuse", "history-rewrite")); err != nil {
		t.Fatalf("history rewrite marker missing: %v", err)
	}
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}
