package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"
)

func TestQuickstartDoesNotDirtyOrStageGitfuseMetadata(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_RELAY_URL", "http://phase34.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "phase34-token")

	repoPath := newPhase34GitRepo(t, "quickstart-clean")
	writeFile(t, filepath.Join(repoPath, ".gitignore"), ".gitfuse/\n")
	writeFile(t, filepath.Join(repoPath, "README.md"), "phase 34 initial\n")
	testGit(t, repoPath, "add", ".gitignore", "README.md")
	testGitEnv(t, repoPath, []string{
		"GIT_AUTHOR_DATE=" + time.Unix(1, 0).UTC().Format(time.RFC3339),
		"GIT_COMMITTER_DATE=" + time.Unix(1, 0).UTC().Format(time.RFC3339),
	}, "commit", "-m", "phase 34 initial commit")
	gitignoreBefore := readFile(t, filepath.Join(repoPath, ".gitignore"))

	var upload syncUploadCapture
	installPhase34RelayTransport(t, &upload, "quickstart-clean-relay")
	var addOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &addOutput, func(cmd *cobra.Command) error {
		return runAdd(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	var syncOutput bytes.Buffer
	if err := runCommandInDir(t, repoPath, &syncOutput, func(cmd *cobra.Command) error {
		return runSync(context.Background(), cmd, syncOptions{}, "")
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(syncOutput.String(), "Synced 1 commit(s).") {
		t.Fatalf("sync output = %q, want one synced commit", syncOutput.String())
	}
	if upload.calls != 1 {
		t.Fatalf("relay upload calls = %d, want 1", upload.calls)
	}
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
	if gitignoreAfter := readFile(t, filepath.Join(repoPath, ".gitignore")); gitignoreAfter != gitignoreBefore {
		t.Fatalf(".gitignore changed\nbefore:\n%s\nafter:\n%s", gitignoreBefore, gitignoreAfter)
	}
	ignored := testGitOutput(t, repoPath, "check-ignore", "-v", ".gitfuse/config")
	if !strings.Contains(ignored, ".gitignore") || !strings.Contains(ignored, ".gitfuse/") {
		t.Fatalf("check-ignore output = %q, want .gitignore .gitfuse/ rule", ignored)
	}
}

func TestAddUsesInfoExcludeWhenGitignoreIsMissing(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_RELAY_URL", "http://phase34.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "phase34-token")

	repoPath := newPhase34GitRepo(t, "no-gitignore")
	commitPhase34File(t, repoPath, "README.md", "readme\n", "initial commit", time.Unix(1, 0))
	var upload syncUploadCapture
	installPhase34RelayTransport(t, &upload, "no-gitignore-relay")

	if err := runCommandInDir(t, repoPath, nil, func(cmd *cobra.Command) error {
		return runAdd(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repoPath, ".gitignore")); !os.IsNotExist(err) {
		t.Fatalf(".gitignore was created or became stat-able: err=%v", err)
	}
	assertInfoExcludeContainsGitfuse(t, repoPath)
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
	ignored := testGitOutput(t, repoPath, "check-ignore", "-v", ".gitfuse/ledger")
	if !strings.Contains(ignored, ".git/info/exclude") || !strings.Contains(ignored, ".gitfuse/") {
		t.Fatalf("check-ignore output = %q, want info/exclude .gitfuse/ rule", ignored)
	}
}

func TestAddLeavesUnrelatedTrackedGitignoreUnchanged(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_RELAY_URL", "http://phase34.test")
	t.Setenv("GITFUSE_TEST_TOKEN", "phase34-token")

	repoPath := newPhase34GitRepo(t, "unrelated-gitignore")
	writeFile(t, filepath.Join(repoPath, ".gitignore"), "node_modules/\n")
	writeFile(t, filepath.Join(repoPath, "README.md"), "readme\n")
	testGit(t, repoPath, "add", ".gitignore", "README.md")
	testGitEnv(t, repoPath, []string{
		"GIT_AUTHOR_DATE=" + time.Unix(1, 0).UTC().Format(time.RFC3339),
		"GIT_COMMITTER_DATE=" + time.Unix(1, 0).UTC().Format(time.RFC3339),
	}, "commit", "-m", "initial commit")
	gitignoreBefore := readFile(t, filepath.Join(repoPath, ".gitignore"))
	var upload syncUploadCapture
	installPhase34RelayTransport(t, &upload, "unrelated-gitignore-relay")

	if err := runCommandInDir(t, repoPath, nil, func(cmd *cobra.Command) error {
		return runAdd(context.Background(), cmd)
	}); err != nil {
		t.Fatal(err)
	}
	if gitignoreAfter := readFile(t, filepath.Join(repoPath, ".gitignore")); gitignoreAfter != gitignoreBefore {
		t.Fatalf(".gitignore changed\nbefore:\n%s\nafter:\n%s", gitignoreBefore, gitignoreAfter)
	}
	assertInfoExcludeContainsGitfuse(t, repoPath)
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func TestStatusUnstagesLegacyGitfuseMetadata(t *testing.T) {
	repoPath := newPhase34GitRepo(t, "legacy-staged")
	initial := commitPhase34File(t, repoPath, "README.md", "readme\n", "initial commit", time.Unix(1, 0))
	repo := syncRelayRepository("legacy-staged", initial)
	writePullMetadata(t, repoPath, repo, initial, "")
	testGit(t, repoPath, "add", ".gitfuse/config", ".gitfuse/ledger")
	if staged := strings.TrimSpace(testGitOutput(t, repoPath, "diff", "--cached", "--name-only", "--", ".gitfuse")); staged == "" {
		t.Fatal("test setup did not stage .gitfuse metadata")
	}

	var output bytes.Buffer
	if err := runCommandInDir(t, repoPath, &output, func(cmd *cobra.Command) error {
		return runStatus(cmd, statusOptions{})
	}); err != nil {
		t.Fatal(err)
	}
	assertInfoExcludeContainsGitfuse(t, repoPath)
	assertCleanWorktree(t, repoPath)
	assertGitfuseNotTrackedOrStaged(t, repoPath)
}

func newPhase34GitRepo(t *testing.T, name string) string {
	t.Helper()
	repoPath := filepath.Join(t.TempDir(), name)
	testGit(t, "", "init", repoPath)
	testGit(t, repoPath, "checkout", "-b", "main")
	testGit(t, repoPath, "config", "user.name", "gitfuse")
	testGit(t, repoPath, "config", "user.email", "test@gitfuse.dev")
	return repoPath
}

func commitPhase34File(t *testing.T, repoPath, name, content, message string, when time.Time) string {
	t.Helper()
	writeFile(t, filepath.Join(repoPath, name), content)
	testGit(t, repoPath, "add", name)
	testGitEnv(t, repoPath, []string{
		"GIT_AUTHOR_DATE=" + when.UTC().Format(time.RFC3339),
		"GIT_COMMITTER_DATE=" + when.UTC().Format(time.RFC3339),
	}, "commit", "-m", message)
	return strings.TrimSpace(testGitOutput(t, repoPath, "rev-parse", "HEAD"))
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertInfoExcludeContainsGitfuse(t *testing.T, repoPath string) {
	t.Helper()
	excludePath, err := gitInfoExcludePath(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	content := readFile(t, excludePath)
	if !strings.Contains(content, ".gitfuse/") {
		t.Fatalf("%s = %q, want .gitfuse/ rule", excludePath, content)
	}
}

func installPhase34RelayTransport(t *testing.T, upload *syncUploadCapture, relayEntryID string) {
	t.Helper()
	previousClient := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: restoreRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Path == "/v1/repos":
			if r.Method != http.MethodPost {
				return restoreJSONResponse(http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"}), nil
			}
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				return restoreJSONResponse(http.StatusBadRequest, map[string]string{"error": err.Error()}), nil
			}
			return restoreJSONResponse(http.StatusCreated, map[string]any{
				"repository": map[string]string{
					"relayEntryId": relayEntryID,
					"remoteUrl":    "",
				},
			}), nil
		case r.URL.Path == "/v1/bundles/upload":
			return captureSyncUpload(r, upload)
		case strings.HasPrefix(r.URL.Path, "/v1/bundles/"):
			return restoreJSONResponse(http.StatusOK, map[string]any{"bundles": []any{}}), nil
		default:
			return restoreJSONResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
		}
	})}
	t.Cleanup(func() {
		http.DefaultClient = previousClient
	})
}
