package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

func TestSyncAlreadySyncedRepoNoopsWithoutRelayUpload(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://sync.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "sync-token")

	repoPath := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-sync", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	headBefore := strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD"))
	ledgerBefore := readFile(t, filepath.Join(repoPath, ".gitfuse", "ledger"))

	var upload syncUploadCapture
	installSyncUploadTransport(t, &upload)

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(output.String(), "No commits to sync.") {
		t.Fatalf("sync output = %q, want no-op message", output.String())
	}
	if upload.calls != 0 {
		t.Fatalf("relay upload calls = %d, want 0", upload.calls)
	}
	if headAfter := strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD")); headAfter != headBefore {
		t.Fatalf("HEAD = %s, want unchanged %s", headAfter, headBefore)
	}
	if ledgerAfter := readFile(t, filepath.Join(repoPath, ".gitfuse", "ledger")); ledgerAfter != ledgerBefore {
		t.Fatalf("ledger changed on no-op sync\nbefore:\n%s\nafter:\n%s", ledgerBefore, ledgerAfter)
	}
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestSyncOneCommitUploadsExactlyOneBundle(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://sync.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "sync-token")

	repoPath := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, repoPath, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("repo-sync", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	second := commitPullFile(t, repoPath, "app.txt", "second\n", "second commit", time.Unix(2, 0))

	var upload syncUploadCapture
	installSyncUploadTransport(t, &upload)

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}

	if upload.calls != 1 {
		t.Fatalf("relay upload calls = %d, want 1", upload.calls)
	}
	if upload.fields["relayEntryId"] != repo.RelayEntryID {
		t.Fatalf("relayEntryId = %q, want %q", upload.fields["relayEntryId"], repo.RelayEntryID)
	}
	if upload.fields["commitCount"] != "1" {
		t.Fatalf("commitCount = %q, want 1", upload.fields["commitCount"])
	}
	sizeBytes, err := strconv.Atoi(upload.fields["sizeBytes"])
	if err != nil {
		t.Fatalf("sizeBytes = %q, want integer", upload.fields["sizeBytes"])
	}
	if sizeBytes != len(upload.payload) {
		t.Fatalf("sizeBytes = %d, payload bytes = %d", sizeBytes, len(upload.payload))
	}
	if upload.fields["bundleHash"] == "" {
		t.Fatal("bundleHash was empty")
	}
	var commitMetadata []struct {
		SHA     string `json:"sha"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(upload.fields["commits"]), &commitMetadata); err != nil {
		t.Fatalf("commits metadata was not valid JSON: %v", err)
	}
	if len(commitMetadata) != 1 || commitMetadata[0].SHA != second || strings.TrimSpace(commitMetadata[0].Message) != "second commit" {
		t.Fatalf("commits metadata = %+v, want uploaded second commit %s", commitMetadata, second)
	}
	if len(upload.payload) == 0 {
		t.Fatal("uploaded bundle payload was empty")
	}
	if !strings.Contains(output.String(), "Synced 1 commit(s).") {
		t.Fatalf("sync output = %q, want success message", output.String())
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != second {
		t.Fatalf("ledger synced head = %s, want %s", ledger.SyncedHead, second)
	}
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestSyncRefusesDivergentRelayHeadAndRepairsCorruptedLedger(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase20.test")
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
	badLocalBundle := mustCreatePullBundle(t, device1, base)
	remoteCommit := commitPullFile(t, device2, "file5-device2.txt", "device 2 remote\n", "device 2 phase 19 remote commit", time.Unix(4, 0))
	remoteBundle := mustCreatePullBundle(t, device2, base)

	repo := syncRelayRepository("repo-phase20", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-base", "device-2", baseBundle, time.Unix(20, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-remote", "device-2", remoteBundle, time.Unix(30, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-bad-local", "device-1", badLocalBundle, time.Unix(40, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, device1, repo, localCommit, base)

	var syncOutput bytes.Buffer
	err := runCommandInDir(t, device1, &syncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	})
	if err == nil {
		t.Fatal("divergent sync succeeded")
	}
	if !strings.Contains(err.Error(), "remote has new commits not included in local HEAD") {
		t.Fatalf("sync error = %q, want divergent relay-head refusal", err.Error())
	}
	if upload.calls != 0 {
		t.Fatalf("relay upload calls = %d, want 0", upload.calls)
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
		t.Fatalf("ledger synced head = %s, want repaired base %s", ledger.SyncedHead, base)
	}
	if ledger.PreviousSyncedHead != "" {
		t.Fatalf("ledger previous synced head = %s, want empty after repair", ledger.PreviousSyncedHead)
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
}

func TestSyncManualRebaseResolutionIgnoresStaleSelfRelayHead(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase21.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())
	if err := config.WriteDeviceID("device-1"); err != nil {
		t.Fatal(err)
	}

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "file1.txt", "one\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	base := commitPullFile(t, device1, "file4.txt", "phase 18\n", "device 2 phase 18 commit", time.Unix(2, 0))
	baseBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	if err := excludeGitfuseMetadata(device2); err != nil {
		t.Fatal(err)
	}

	repo := syncRelayRepository("repo-phase21", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-base", "device-1", baseBundle, time.Unix(20, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, device1, repo, base, initial)
	writePullMetadata(t, device2, repo, base, initial)

	localCommit := commitPullFile(t, device1, "file5-device1.txt", "device 1 local\n", "device 1 phase 19 local commit", time.Unix(3, 0))
	badLocalBundle := mustCreatePullBundle(t, device1, base)
	remoteCommit := commitPullFile(t, device2, "file5-device2.txt", "device 2 remote\n", "device 2 phase 19 remote commit", time.Unix(4, 0))

	if err := config.WriteDeviceID("device-2"); err != nil {
		t.Fatal(err)
	}
	var remoteSyncOutput bytes.Buffer
	if err := runCommandInDir(t, device2, &remoteSyncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(remoteSyncOutput.String(), "Synced 1 commit(s).") {
		t.Fatalf("device 2 sync output = %q, want one remote commit uploaded", remoteSyncOutput.String())
	}
	if upload.fields["commitCount"] != "1" {
		t.Fatalf("device 2 upload commitCount = %q, want 1", upload.fields["commitCount"])
	}
	remoteBundle := uploadedBundlePayload(t, upload)
	if remoteBundle.Manifest.HeadSHA != remoteCommit {
		t.Fatalf("device 2 uploaded head = %s, want %s", remoteBundle.Manifest.HeadSHA, remoteCommit)
	}
	relay.addBundle(repo.RelayEntryID, "bundle-remote", "device-2", remoteBundle, time.Unix(30, 0))
	upload.calls = 0
	upload.fields = nil
	upload.payload = nil

	if err := config.WriteDeviceID("device-1"); err != nil {
		t.Fatal(err)
	}
	var divergentPullOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &divergentPullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(divergentPullOutput.String(), "Pulled 1 commit(s), branch unchanged because non-fast-forward.") {
		t.Fatalf("device 1 pull output = %q, want non-fast-forward import", divergentPullOutput.String())
	}
	assertRestoredHead(t, device1, localCommit)
	if present, err := commitExists(device1, remoteCommit); err != nil {
		t.Fatal(err)
	} else if !present {
		t.Fatalf("device 1 did not import remote commit %s before manual rebase", remoteCommit)
	}
	relay.addBundle(repo.RelayEntryID, "bundle-stale-local", "device-1", badLocalBundle, time.Unix(40, 0))

	testGit(t, device1, "reset", "--hard", remoteCommit)
	rebasedCommit := commitPullFile(t, device1, "file5-device1.txt", "device 1 local\n", "device 1 phase 21 rebased local commit", time.Unix(5, 0))
	assertFileContent(t, device1, "file5-device1.txt", "device 1 local\n")
	assertFileContent(t, device1, "file5-device2.txt", "device 2 remote\n")
	if reachable, err := commitReachableFrom(device1, remoteCommit, rebasedCommit); err != nil {
		t.Fatal(err)
	} else if !reachable {
		t.Fatalf("remote commit %s is not reachable from rebased HEAD %s", remoteCommit, rebasedCommit)
	}
	if reachable, err := commitReachableFrom(device1, localCommit, rebasedCommit); err != nil {
		t.Fatal(err)
	} else if reachable {
		t.Fatalf("stale local commit %s unexpectedly reachable from rebased HEAD %s", localCommit, rebasedCommit)
	}

	var resolvedSyncOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &resolvedSyncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(resolvedSyncOutput.String(), "Synced 1 commit(s).") {
		t.Fatalf("resolved sync output = %q, want one rebased commit uploaded", resolvedSyncOutput.String())
	}
	if upload.calls != 1 {
		t.Fatalf("resolved sync upload calls = %d, want 1", upload.calls)
	}
	if upload.fields["commitCount"] != "1" {
		t.Fatalf("resolved sync commitCount = %q, want 1", upload.fields["commitCount"])
	}
	resolvedBundle := uploadedBundlePayload(t, upload)
	if resolvedBundle.Manifest.HeadSHA != rebasedCommit {
		t.Fatalf("resolved uploaded head = %s, want %s", resolvedBundle.Manifest.HeadSHA, rebasedCommit)
	}
	ledger, err := workspace.ReadLedger(device1)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.SyncedHead != rebasedCommit {
		t.Fatalf("device 1 ledger synced head = %s, want %s", ledger.SyncedHead, rebasedCommit)
	}

	var statusOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &statusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(statusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("status output = %q, want synced after resolution", statusOutput.String())
	}

	var logOutput bytes.Buffer
	if err := runCommandInDir(t, device1, &logOutput, func(cmd *cobra.Command) error {
		return runLog(cmd)
	}); err != nil {
		t.Fatal(err)
	}
	assertLogContains(t, logOutput.String(), "synced", rebasedCommit, "device 1 phase 21 rebased local commit")
	assertLogContains(t, logOutput.String(), "synced", remoteCommit, "device 2 phase 19 remote commit")
	if strings.Contains(logOutput.String(), "local-only") {
		t.Fatalf("log output still showed local-only commits after resolved sync:\n%s", logOutput.String())
	}

	relay.addBundle(repo.RelayEntryID, "bundle-rebased", "device-1", resolvedBundle, time.Unix(50, 0))
	if err := config.WriteDeviceID("device-2"); err != nil {
		t.Fatal(err)
	}
	var finalPullOutput bytes.Buffer
	if err := runCommandInDir(t, device2, &finalPullOutput, func(cmd *cobra.Command) error {
		return runPull(cmd, pullOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(finalPullOutput.String(), "Pulled 1 commit(s), fast-forwarded branch.") {
		t.Fatalf("device 2 pull output = %q, want fast-forward", finalPullOutput.String())
	}
	assertRestoredHead(t, device2, rebasedCommit)
	assertFileContent(t, device2, "file5-device1.txt", "device 1 local\n")
	assertFileContent(t, device2, "file5-device2.txt", "device 2 remote\n")
	var finalStatusOutput bytes.Buffer
	if err := runCommandInDir(t, device2, &finalStatusOutput, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(finalStatusOutput.String(), "Commits ahead: 0") {
		t.Fatalf("device 2 status output = %q, want synced after final pull", finalStatusOutput.String())
	}
	assertCleanWorktree(t, device1)
	assertCleanWorktree(t, device2)
	assertGitfuseNotTrackedOrStaged(t, device1)
	assertGitfuseNotTrackedOrStaged(t, device2)
}

func TestSyncPhase17PullThenNoopSyncOnBothDevices(t *testing.T) {
	t.Setenv("GITFUSE_RELAY_URL", "http://phase17.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "pull-token")
	t.Setenv("GITFUSE_HOME", t.TempDir())

	device1 := newPullGitRepo(t, "device1", "main")
	initial := commitPullFile(t, device1, "README.md", "initial\n", "initial commit", time.Unix(1, 0))
	initialBundle := mustCreatePullBundle(t, device1, "")
	second := commitPullFile(t, device1, "app.txt", "second\n", "second commit", time.Unix(2, 0))
	secondBundle := mustCreatePullBundle(t, device1, initial)

	device2 := filepath.Join(t.TempDir(), "device2")
	testGit(t, "", "clone", device1, device2)
	testGit(t, device2, "config", "user.name", "gitfuse")
	testGit(t, device2, "config", "user.email", "test@gitfuse.dev")
	if err := excludeGitfuseMetadata(device2); err != nil {
		t.Fatal(err)
	}

	repo := syncRelayRepository("repo-task062-v4", initial)
	relay := newPullRelayFixture(repo)
	relay.addBundle(repo.RelayEntryID, "bundle-initial", "device-1", initialBundle, time.Unix(10, 0))
	relay.addBundle(repo.RelayEntryID, "bundle-second", "device-1", secondBundle, time.Unix(20, 0))
	var upload syncUploadCapture
	installPhase17RelayTransport(t, relay, &upload)
	writePullMetadata(t, device1, repo, second, initial)
	writePullMetadata(t, device2, repo, second, initial)

	for _, device := range []string{device1, device2} {
		var pullOutput bytes.Buffer
		if err := runCommandInDir(t, device, &pullOutput, func(cmd *cobra.Command) error {
			return runPull(cmd, pullOptions{})
		}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(pullOutput.String(), "No new commits to pull.") {
			t.Fatalf("pull output for %s = %q, want no new commits", device, pullOutput.String())
		}

		var syncOutput bytes.Buffer
		if err := runCommandInDir(t, device, &syncOutput, func(cmd *cobra.Command) error {
			return runSync(context.Background(), cmd, syncOptions{}, "")
		}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(syncOutput.String(), "No commits to sync.") {
			t.Fatalf("sync output for %s = %q, want no commits", device, syncOutput.String())
		}
		if head := strings.TrimSpace(testGitOutput(t, device, "rev-parse", "HEAD")); head != second {
			t.Fatalf("HEAD for %s = %s, want %s", device, head, second)
		}
		assertCleanWorktree(t, device)
		assertGitfuseNotTrackedOrStaged(t, device)
	}
	if upload.calls != 0 {
		t.Fatalf("relay upload calls = %d, want 0", upload.calls)
	}
}

func TestSubmoduleWarningPrintedOnce(t *testing.T) {
	repoPath := t.TempDir()
	if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{}); err != nil {
		t.Fatal(err)
	}
	submodules := []gfgit.BundleSubmodule{{Path: "vendor/lib", Hash: strings.Repeat("1", 40)}}

	submoduleWarningPrinted = false
	var first bytes.Buffer
	firstCmd := &cobra.Command{}
	firstCmd.SetOut(&first)
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := printSubmoduleWarningOnce(firstCmd, repoPath, submodules, &ledger); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(first.String(), "Submodules detected at vendor/lib") {
		t.Fatalf("first warning output = %q", first.String())
	}
	if _, err := workspace.ReadLedger(repoPath); err != nil {
		t.Fatal(err)
	}
	ledgerPath := filepath.Join(repoPath, ".gitfuse", "ledger")
	if !strings.Contains(readFile(t, ledgerPath), "submodule_warning_shown = true") {
		t.Fatal("ledger did not persist submodule warning marker")
	}

	submoduleWarningPrinted = false
	var second bytes.Buffer
	secondCmd := &cobra.Command{}
	secondCmd.SetOut(&second)
	ledger, err = workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := printSubmoduleWarningOnce(secondCmd, repoPath, submodules, &ledger); err != nil {
		t.Fatal(err)
	}
	if second.String() != "" {
		t.Fatalf("second warning output = %q, want empty", second.String())
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

type syncUploadCapture struct {
	calls   int
	fields  map[string]string
	payload []byte
}

func installSyncUploadTransport(t *testing.T, upload *syncUploadCapture) {
	t.Helper()
	previousClient := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: restoreRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/bundles/upload" {
			return captureSyncUpload(r, upload)
		}
		if strings.HasPrefix(r.URL.Path, "/v1/bundles/") {
			return restoreJSONResponse(http.StatusOK, map[string]any{"bundles": []any{}}), nil
		}
		if r.URL.Path != "/v1/bundles/upload" {
			return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
		}
		return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
	})}
	t.Cleanup(func() {
		http.DefaultClient = previousClient
	})
}

func installPhase17RelayTransport(t *testing.T, relay *pullRelayFixture, upload *syncUploadCapture) {
	t.Helper()
	previousClient := http.DefaultClient
	pullTransport := newPullRelayTransport(t, relay)
	http.DefaultClient = &http.Client{Transport: restoreRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/bundles/upload" {
			return captureSyncUpload(r, upload)
		}
		return pullTransport.RoundTrip(r)
	})}
	t.Cleanup(func() {
		http.DefaultClient = previousClient
	})
}

func captureSyncUpload(r *http.Request, upload *syncUploadCapture) (*http.Response, error) {
	upload.calls++
	if r.Header.Get("authorization") == "" {
		return restoreJSONResponse(http.StatusUnauthorized, map[string]string{"error": "missing auth"}), nil
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return restoreJSONResponse(http.StatusBadRequest, map[string]string{"error": err.Error()}), nil
	}
	defer r.MultipartForm.RemoveAll()
	upload.fields = map[string]string{
		"relayEntryId": r.FormValue("relayEntryId"),
		"bundleHash":   r.FormValue("bundleHash"),
		"commitCount":  r.FormValue("commitCount"),
		"sizeBytes":    r.FormValue("sizeBytes"),
		"commits":      r.FormValue("commits"),
	}
	files := r.MultipartForm.File["bundle"]
	if len(files) == 0 {
		return restoreJSONResponse(http.StatusBadRequest, map[string]string{"error": "missing bundle"}), nil
	}
	file, err := files[0].Open()
	if err != nil {
		return restoreJSONResponse(http.StatusBadRequest, map[string]string{"error": err.Error()}), nil
	}
	defer file.Close()
	payload, err := io.ReadAll(file)
	if err != nil {
		return restoreJSONResponse(http.StatusBadRequest, map[string]string{"error": err.Error()}), nil
	}
	upload.payload = append(upload.payload[:0], payload...)
	return restoreJSONResponse(http.StatusOK, map[string]string{"status": "ok"}), nil
}

func uploadedBundlePayload(t *testing.T, upload syncUploadCapture) gfgit.BundlePayload {
	t.Helper()
	if len(upload.payload) == 0 {
		t.Fatal("uploaded bundle payload was empty")
	}
	var manifest gfgit.BundleManifest
	if err := json.Unmarshal(upload.payload, &manifest); err != nil {
		t.Fatal(err)
	}
	payload := append([]byte(nil), upload.payload...)
	return gfgit.BundlePayload{
		Manifest: manifest,
		Bytes:    payload,
		SHA256:   gfgit.SHA256(payload),
	}
}

func syncRelayRepository(name, rootSHA string) relayRepository {
	return relayRepository{
		ID:           name + "-id",
		UserID:       "user-id",
		RootSHA:      rootSHA,
		DisplayName:  name,
		RemoteURL:    "",
		RelayEntryID: name + "-relay",
	}
}

func assertCleanWorktree(t *testing.T, repoPath string) {
	t.Helper()
	if status := strings.TrimSpace(testGitOutput(t, repoPath, "status", "--porcelain")); status != "" {
		t.Fatalf("working tree status = %q, want clean", status)
	}
}
