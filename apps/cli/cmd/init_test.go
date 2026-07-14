package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
)

func TestInitHelpShowsNoArgAndNamedForms(t *testing.T) {
	output, err := executeRootCommand(t, "init", "--help")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"gitfuse init [name]",
		"\n  gitfuse init\n",
		"gitfuse init my-project",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("init help output missing %q:\n%s", want, output)
		}
	}
}

func TestInitWithoutNameDerivesCurrentDirectoryBasename(t *testing.T) {
	repoPath, relay := setupInitCommandTest(t, "current-repo")

	output, err := executeRootCommandInDirectory(t, repoPath, "init")
	if err != nil {
		if strings.Contains(err.Error(), "accepts 1 arg(s)") {
			t.Fatalf("init failed with Cobra arg-count validation: %v", err)
		}
		t.Fatal(err)
	}
	if !strings.Contains(output, "Initialized public github repository https://github.com/gitfuse/current-repo.git.") {
		t.Fatalf("init output = %q", output)
	}
	if origin := strings.TrimSpace(testGitOutput(t, repoPath, "remote", "get-url", "origin")); origin != "https://github.com/gitfuse/current-repo.git" {
		t.Fatalf("origin = %q, want derived current directory remote", origin)
	}
	if got := relay.displayName(); got != "current-repo" {
		t.Fatalf("relay displayName = %q, want current-repo", got)
	}
	cfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DisplayName != "current-repo" {
		t.Fatalf("local display_name = %q, want current-repo", cfg.DisplayName)
	}
}

func TestInitExplicitNameStillCreatesNamedPlatformRemote(t *testing.T) {
	cases := []struct {
		name       string
		args       []string
		wantRemote string
		wantOutput string
	}{
		{
			name:       "default github public",
			args:       []string{"init", "ExplicitName"},
			wantRemote: "https://github.com/gitfuse/ExplicitName.git",
			wantOutput: "Initialized public github repository https://github.com/gitfuse/ExplicitName.git.",
		},
		{
			name:       "github flag",
			args:       []string{"init", "GithubName", "--github"},
			wantRemote: "https://github.com/gitfuse/GithubName.git",
			wantOutput: "Initialized public github repository https://github.com/gitfuse/GithubName.git.",
		},
		{
			name:       "gitlab flag",
			args:       []string{"init", "GitlabName", "--gitlab"},
			wantRemote: "https://gitlab.com/gitfuse/GitlabName.git",
			wantOutput: "Initialized public gitlab repository https://gitlab.com/gitfuse/GitlabName.git.",
		},
		{
			name:       "bitbucket flag",
			args:       []string{"init", "BitbucketName", "--bitbucket"},
			wantRemote: "https://bitbucket.org/gitfuse/BitbucketName.git",
			wantOutput: "Initialized public bitbucket repository https://bitbucket.org/gitfuse/BitbucketName.git.",
		},
		{
			name:       "public flag",
			args:       []string{"init", "PublicName", "--public"},
			wantRemote: "https://github.com/gitfuse/PublicName.git",
			wantOutput: "Initialized public github repository https://github.com/gitfuse/PublicName.git.",
		},
		{
			name:       "private flag",
			args:       []string{"init", "PrivateName", "--private"},
			wantRemote: "https://github.com/gitfuse/PrivateName.git",
			wantOutput: "Initialized private github repository https://github.com/gitfuse/PrivateName.git.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repoPath, relay := setupInitCommandTest(t, strings.ReplaceAll(tc.name, " ", "-"))

			output, err := executeRootCommandInDirectory(t, repoPath, tc.args...)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(output, tc.wantOutput) {
				t.Fatalf("init output = %q, want %q", output, tc.wantOutput)
			}
			if origin := strings.TrimSpace(testGitOutput(t, repoPath, "remote", "get-url", "origin")); origin != tc.wantRemote {
				t.Fatalf("origin = %q, want explicit name remote %q", origin, tc.wantRemote)
			}
			if got := relay.displayName(); got != strings.ReplaceAll(tc.name, " ", "-") {
				t.Fatalf("relay displayName = %q, want existing add-path basename behavior", got)
			}
		})
	}
}

func TestInitRejectsInvalidDerivedAndExplicitNamesCleanly(t *testing.T) {
	cases := []struct {
		name     string
		repoName string
		args     []string
	}{
		{
			name:     "derived",
			repoName: "!!!",
			args:     []string{"init"},
		},
		{
			name:     "explicit",
			repoName: "valid-repo",
			args:     []string{"init", "bad/name"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repoPath, relay := setupInitCommandTest(t, tc.repoName)

			_, err := executeRootCommandInDirectory(t, repoPath, tc.args...)
			if err == nil {
				t.Fatal("init succeeded with invalid repository name")
			}
			if strings.Contains(err.Error(), "accepts 1 arg(s)") {
				t.Fatalf("init failed with Cobra arg-count validation instead of name validation: %v", err)
			}
			if !strings.Contains(err.Error(), "invalid repository name") {
				t.Fatalf("init error = %q, want clean repository name validation", err.Error())
			}
			if relay.calls != 0 {
				t.Fatalf("relay calls = %d, want 0 before validation failure", relay.calls)
			}
			if _, statErr := os.Stat(filepath.Join(repoPath, ".git")); !os.IsNotExist(statErr) {
				t.Fatalf(".git was created before validation failure: err=%v", statErr)
			}
		})
	}
}

func TestInitRepositoryNameNormalization(t *testing.T) {
	repoPath := filepath.Join(t.TempDir(), "Current Repo")
	name, err := resolveInitRepositoryName(repoPath, "")
	if err != nil {
		t.Fatal(err)
	}
	if name != "Current-Repo" {
		t.Fatalf("derived name = %q, want sanitized basename", name)
	}

	name, err = resolveInitRepositoryName(repoPath, "Explicit_Name.1")
	if err != nil {
		t.Fatal(err)
	}
	if name != "Explicit_Name.1" {
		t.Fatalf("explicit name = %q, want unchanged valid name", name)
	}
}

func executeRootCommandInDirectory(t *testing.T, dir string, args ...string) (string, error) {
	t.Helper()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	output, execErr := executeRootCommand(t, append([]string{"--chdir", dir}, args...)...)
	if err := os.Chdir(previous); err != nil {
		t.Fatal(err)
	}
	return output, execErr
}

func setupInitCommandTest(t *testing.T, repoName string) (string, *initRelayCapture) {
	t.Helper()

	repoPath := filepath.Join(t.TempDir(), repoName)
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}

	relay := &initRelayCapture{}
	server := httptest.NewServer(http.HandlerFunc(relay.handle))
	t.Cleanup(server.Close)

	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_TEST_TOKEN", "init-token")
	t.Setenv("GITFUSE_RELAY_URL", server.URL)
	t.Setenv("GITFUSE_PLATFORM_API_URL", "")
	t.Setenv("GITFUSE_PLATFORM_MOCK", "1")

	return repoPath, relay
}

type initRelayCapture struct {
	calls        int
	displayNames []string
	rootSHAs     []string
}

func (capture *initRelayCapture) handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/v1/repos" || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	capture.calls++
	if r.Header.Get("authorization") != "Bearer init-token" {
		http.Error(w, "missing auth", http.StatusUnauthorized)
		return
	}

	var body struct {
		RootSHA     string `json:"rootSha"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.RootSHA) == "" || strings.TrimSpace(body.DisplayName) == "" {
		http.Error(w, "missing repository payload", http.StatusBadRequest)
		return
	}
	capture.rootSHAs = append(capture.rootSHAs, body.RootSHA)
	capture.displayNames = append(capture.displayNames, body.DisplayName)

	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"repository": map[string]string{
			"relayEntryId": body.DisplayName + "-relay",
			"remoteUrl":    "",
		},
	})
}

func (capture *initRelayCapture) displayName() string {
	if len(capture.displayNames) == 0 {
		return ""
	}
	return capture.displayNames[len(capture.displayNames)-1]
}
