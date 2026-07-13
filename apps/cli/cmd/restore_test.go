package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/spf13/cobra"
)

type restoreCommitSpec struct {
	message string
	files   map[string]string
}

type restoreFixture struct {
	displayName  string
	relayEntryID string
	branch       string
	sourcePath   string
	rootSHA      string
	headSHA      string
	commits      []string
	bundle       gfgit.BundlePayload
}

func TestRestoreOneCommitCreatesHeadCheckoutAndRegistry(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-one", "feature/one", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"README.md": "hello\n"}},
	})
	workDir := t.TempDir()
	var output bytes.Buffer

	if err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{}, &output); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(workDir, fixture.displayName)
	assertRestoredHead(t, target, fixture.headSHA)
	assertRestoredBranch(t, target, fixture.branch)
	assertFileContent(t, target, "README.md", "hello\n")
	assertFileMatchesHEAD(t, target, "README.md")
	assertRegistryContains(t, target, fixture)
	assertGitfuseNotTrackedOrStaged(t, target)
	if strings.Contains(output.String(), filepath.Join(fixture.displayName, fixture.displayName)) {
		t.Fatalf("restore output used double nesting: %q", output.String())
	}
}

func TestRestoreUsesEmptyCurrentDirectoryNamedForRepository(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-current", "feature/current", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"README.md": "current\n"}},
	})
	parent := t.TempDir()
	workDir := filepath.Join(parent, fixture.displayName)
	if err := os.Mkdir(workDir, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{}, nil); err != nil {
		t.Fatal(err)
	}

	assertRestoredHead(t, workDir, fixture.headSHA)
	assertFileContent(t, workDir, "README.md", "current\n")
	if _, err := os.Stat(filepath.Join(workDir, fixture.displayName)); !os.IsNotExist(err) {
		t.Fatalf("restore created nested target; stat err = %v", err)
	}
}

func TestRestoreMultiCommitRestoresSourceBranchLogAndWorkingTree(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-task062", "feature/task062", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"README.md": "initial\n"}},
		{message: "second commit", files: map[string]string{"README.md": "initial\n", "app.txt": "second\n"}},
	})
	workDir := t.TempDir()

	if err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{}, nil); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(workDir, fixture.displayName)
	assertRestoredHead(t, target, fixture.headSHA)
	assertRestoredBranch(t, target, fixture.branch)
	assertGitLogContainsAll(t, target, fixture.commits)
	assertFileContent(t, target, "README.md", "initial\n")
	assertFileContent(t, target, "app.txt", "second\n")
	assertFileMatchesHEAD(t, target, "README.md")
	assertFileMatchesHEAD(t, target, "app.txt")
}

func TestRestoreExactExpectedCommits(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-exact", "restore/source", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"tracked.txt": "one\n"}},
		{message: "second commit", files: map[string]string{"tracked.txt": "two\n", "dir/data.txt": "payload\n"}},
	})
	expectedCommits := append([]string(nil), fixture.commits...)
	workDir := t.TempDir()

	if err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{}, nil); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(workDir, fixture.displayName)
	assertGitLogContainsAll(t, target, expectedCommits)
	gotHead := strings.TrimSpace(testGitOutput(t, target, "rev-parse", "--verify", "HEAD"))
	if gotHead != expectedCommits[len(expectedCommits)-1] {
		t.Fatalf("HEAD = %s, want exact restored commit %s", gotHead, expectedCommits[len(expectedCommits)-1])
	}
}

func TestRestoreMissingPayloadRollsBackAndDoesNotReportSuccess(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-missing", "feature/missing", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"README.md": "missing\n"}},
	})
	workDir := t.TempDir()
	var output bytes.Buffer

	err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{missingPayload: true}, &output)
	if err == nil {
		t.Fatal("restore succeeded with missing payload")
	}
	if !strings.Contains(err.Error(), "Relay metadata exists for repo-missing, but its bundle payload is unavailable.") {
		t.Fatalf("error = %q, want missing payload message", err.Error())
	}
	if strings.Contains(output.String(), "Restored") {
		t.Fatalf("restore printed success on failure: %q", output.String())
	}
	if _, statErr := os.Stat(filepath.Join(workDir, fixture.displayName)); !os.IsNotExist(statErr) {
		t.Fatalf("partial restore target still exists; stat err = %v", statErr)
	}
	registry, registryErr := config.ReadRepositoryRegistry()
	if registryErr != nil {
		t.Fatal(registryErr)
	}
	if len(registry.Entries) != 0 {
		t.Fatalf("restore registered a failed repository: %#v", registry.Entries)
	}
}

func TestRestoreExpiredBundlesFailsBeforeCreatingRepository(t *testing.T) {
	fixture := newRestoreFixture(t, "repo-expired", "feature/expired", []restoreCommitSpec{
		{message: "initial commit", files: map[string]string{"README.md": "expired\n"}},
	})
	workDir := t.TempDir()

	err := runRestoreWithFixture(t, workDir, fixture, restoreServerOptions{expired: true}, nil)
	if err == nil {
		t.Fatal("restore succeeded with expired bundle")
	}
	if !strings.Contains(err.Error(), "The relay history for repo-expired has expired and cannot be restored.") {
		t.Fatalf("error = %q, want expired history message", err.Error())
	}
	if _, statErr := os.Stat(filepath.Join(workDir, fixture.displayName)); !os.IsNotExist(statErr) {
		t.Fatalf("partial restore target still exists; stat err = %v", statErr)
	}
}

type restoreServerOptions struct {
	missingPayload bool
	expired        bool
}

func runRestoreWithFixture(t *testing.T, workDir string, fixture restoreFixture, opts restoreServerOptions, output *bytes.Buffer) error {
	t.Helper()
	previousClient := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: newRestoreTransport(t, fixture, opts)}
	defer func() {
		http.DefaultClient = previousClient
	}()

	t.Setenv("GITFUSE_RELAY_URL", "http://restore.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "restore-token")
	t.Setenv("GITFUSE_CONFIG_DIR", t.TempDir())

	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(workDir); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := os.Chdir(previous); err != nil {
			t.Fatal(err)
		}
	}()

	cmd := &cobra.Command{}
	if output != nil {
		cmd.SetOut(output)
	}
	return runRestore(cmd, fixture.displayName)
}

func newRestoreTransport(t *testing.T, fixture restoreFixture, opts restoreServerOptions) http.RoundTripper {
	t.Helper()
	return restoreRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("authorization") != "Bearer restore-token" {
			return restoreJSONResponse(http.StatusUnauthorized, map[string]string{"error": "missing auth"}), nil
		}
		switch r.URL.Path {
		case "/v1/repos":
			return restoreJSONResponse(http.StatusOK, map[string]any{
				"repositories": []map[string]any{{
					"id":           "repo-id",
					"userId":       "user-id",
					"rootSha":      fixture.rootSHA,
					"displayName":  fixture.displayName,
					"remoteUrl":    "",
					"relayEntryId": fixture.relayEntryID,
					"createdAt":    time.Now().UTC().Format(time.RFC3339),
				}},
			}), nil
		case "/v1/bundles/" + fixture.relayEntryID:
			expiresAt := time.Now().Add(24 * time.Hour)
			if opts.expired {
				expiresAt = time.Now().Add(-time.Hour)
			}
			return restoreJSONResponse(http.StatusOK, map[string]any{
				"bundles": []map[string]any{{
					"id":             "bundle-1",
					"repositoryId":   "repo-id",
					"deviceId":       "device-id",
					"bundleHash":     fixture.bundle.SHA256,
					"commitCount":    len(fixture.bundle.Manifest.Commits),
					"sizeBytes":      len(fixture.bundle.Bytes),
					"r2Key":          "user/repo/bundle.enc",
					"status":         "active",
					"parentBundleId": nil,
					"createdAt":      time.Now().Add(-time.Minute).UTC().Format(time.RFC3339),
					"expiresAt":      expiresAt.UTC().Format(time.RFC3339),
				}},
			}), nil
		case "/v1/bundles/bundle-1/download":
			if opts.missingPayload {
				return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "missing"}), nil
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"content-type":             []string{"application/octet-stream"},
					"x-gitfuse-bundle-hash":    []string{fixture.bundle.SHA256},
					"content-length":           []string{},
					"x-gitfuse-test-transport": []string{"restore"},
				},
				Body: io.NopCloser(bytes.NewReader(fixture.bundle.Bytes)),
			}, nil
		default:
			return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
		}
	})
}

type restoreRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn restoreRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func restoreJSONResponse(status int, payload any) *http.Response {
	var body bytes.Buffer
	_ = json.NewEncoder(&body).Encode(payload)
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"content-type": []string{"application/json"}},
		Body:       io.NopCloser(&body),
	}
}

func newRestoreFixture(t *testing.T, displayName, branch string, commits []restoreCommitSpec) restoreFixture {
	t.Helper()
	sourcePath := t.TempDir()
	testGit(t, "", "init", sourcePath)
	testGit(t, sourcePath, "checkout", "-b", branch)
	testGit(t, sourcePath, "config", "user.name", "gitfuse")
	testGit(t, sourcePath, "config", "user.email", "test@gitfuse.dev")

	hashes := make([]string, 0, len(commits))
	for i, commit := range commits {
		for name, content := range commit.files {
			path := filepath.Join(sourcePath, name)
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		testGit(t, sourcePath, "add", ".")
		when := time.Unix(int64(i+1), 0).UTC().Format(time.RFC3339)
		testGitEnv(t, sourcePath, []string{
			"GIT_AUTHOR_DATE=" + when,
			"GIT_COMMITTER_DATE=" + when,
		}, "commit", "-m", commit.message)
		hashes = append(hashes, strings.TrimSpace(testGitOutput(t, sourcePath, "rev-parse", "HEAD")))
	}

	bundle, err := gfgit.CreateIncrementalBundle(sourcePath, "")
	if err != nil {
		t.Fatal(err)
	}
	return restoreFixture{
		displayName:  displayName,
		relayEntryID: displayName + "-relay",
		branch:       branch,
		sourcePath:   sourcePath,
		rootSHA:      hashes[0],
		headSHA:      hashes[len(hashes)-1],
		commits:      hashes,
		bundle:       bundle,
	}
}

func assertRestoredHead(t *testing.T, target, want string) {
	t.Helper()
	got := strings.TrimSpace(testGitOutput(t, target, "rev-parse", "--verify", "HEAD"))
	if got != want {
		t.Fatalf("HEAD = %s, want %s", got, want)
	}
	testGit(t, target, "cat-file", "-e", "HEAD^{commit}")
}

func assertRestoredBranch(t *testing.T, target, want string) {
	t.Helper()
	got := strings.TrimSpace(testGitOutput(t, target, "branch", "--show-current"))
	if got != want {
		t.Fatalf("branch = %s, want %s", got, want)
	}
	testGit(t, target, "show-ref", "--verify", "refs/heads/"+want)
}

func assertGitLogContainsAll(t *testing.T, target string, commits []string) {
	t.Helper()
	log := testGitOutput(t, target, "log", "--all", "--format=%H")
	for _, commit := range commits {
		if !strings.Contains(log, commit) {
			t.Fatalf("git log --all = %q, want commit %s", log, commit)
		}
	}
}

func assertFileContent(t *testing.T, target, name, want string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(target, name))
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != want {
		t.Fatalf("%s = %q, want %q", name, string(content), want)
	}
}

func assertFileMatchesHEAD(t *testing.T, target, name string) {
	t.Helper()
	fromHead := testGitOutput(t, target, "show", "HEAD:"+filepath.ToSlash(name))
	content, err := os.ReadFile(filepath.Join(target, name))
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != fromHead {
		t.Fatalf("%s content does not match HEAD", name)
	}
}

func assertRegistryContains(t *testing.T, target string, fixture restoreFixture) {
	t.Helper()
	canonical, err := canonicalPath(target)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := config.ReadRepositoryRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range registry.Entries {
		if entry.Name == fixture.displayName && entry.Path == canonical && entry.RelayEntryID == fixture.relayEntryID {
			return
		}
	}
	t.Fatalf("registry entries = %#v, want restored repo", registry.Entries)
}

func assertGitfuseNotTrackedOrStaged(t *testing.T, target string) {
	t.Helper()
	tracked := strings.TrimSpace(testGitOutput(t, target, "ls-files", "--", ".gitfuse"))
	if tracked != "" {
		t.Fatalf(".gitfuse tracked files = %q, want none", tracked)
	}
	staged := strings.TrimSpace(testGitOutput(t, target, "diff", "--cached", "--name-only", "--", ".gitfuse"))
	if staged != "" {
		t.Fatalf(".gitfuse staged files = %q, want none", staged)
	}
}

func testGit(t *testing.T, repoPath string, args ...string) {
	t.Helper()
	testGitEnv(t, repoPath, nil, args...)
}

func testGitEnv(t *testing.T, repoPath string, env []string, args ...string) {
	t.Helper()
	fullArgs := args
	if repoPath != "" {
		fullArgs = append([]string{"-C", repoPath}, args...)
	}
	cmd := exec.Command("git", fullArgs...)
	cmd.Env = append(os.Environ(), env...)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
}

func testGitOutput(t *testing.T, repoPath string, args ...string) string {
	t.Helper()
	fullArgs := args
	if repoPath != "" {
		fullArgs = append([]string{"-C", repoPath}, args...)
	}
	cmd := exec.Command("git", fullArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return string(output)
}
