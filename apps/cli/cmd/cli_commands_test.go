package cmd

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func TestReadOnlyCommandsDoNotCreateConfigDirectory(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want string
	}{
		{name: "help", args: []string{"--help"}, want: "gitfuse syncs committed git objects"},
		{name: "version", args: []string{"version"}, want: "gitfuse"},
		{name: "config-dir", args: []string{"config-dir"}, want: "CONFIG_DIR"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "fresh config")
			t.Setenv("GITFUSE_CONFIG_DIR", dir)

			output, err := executeRootCommand(t, tc.args...)
			if err != nil {
				t.Fatal(err)
			}
			want := tc.want
			if want == "CONFIG_DIR" {
				want = dir
			}
			if !strings.Contains(output, want) {
				t.Fatalf("%v output = %q, want to contain %q", tc.args, output, want)
			}
			if _, err := os.Stat(dir); !os.IsNotExist(err) {
				t.Fatalf("config dir was created by %v: err=%v", tc.args, err)
			}
		})
	}
}

func TestVersionCommandAndRootFlagAgree(t *testing.T) {
	withBuildMetadata(t, "dev", "unknown", "unknown", "")

	commandOutput, err := executeRootCommand(t, "version")
	if err != nil {
		t.Fatal(err)
	}
	flagOutput, err := executeRootCommand(t, "--version")
	if err != nil {
		t.Fatal(err)
	}
	if commandOutput != flagOutput {
		t.Fatalf("version outputs differ:\ncommand=%s\nflag=%s", commandOutput, flagOutput)
	}
	for _, expected := range []string{"gitfuse dev", "commit:", "built:", "platform:"} {
		if !strings.Contains(commandOutput, expected) {
			t.Fatalf("version output missing %q: %s", expected, commandOutput)
		}
	}
}

func TestProtectedCommandReturnsFriendlyUnauthenticatedMessage(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "fresh"))
	t.Setenv("GITFUSE_TEST_TOKEN", "")

	_, err := executeRootCommand(t, "devices")
	if err == nil {
		t.Fatal("devices succeeded without credentials")
	}
	if err.Error() != notAuthenticatedMessage {
		t.Fatalf("err = %q, want %q", err.Error(), notAuthenticatedMessage)
	}
}

func TestAuthLoginHelpWorks(t *testing.T) {
	output, err := executeRootCommand(t, "auth", "login", "--help")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output, "Authenticate this device with gitfuse") {
		t.Fatalf("auth login help output = %q", output)
	}
}

func TestPublicCommandContractHelpOutput(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want []string
	}{
		{
			name: "auth",
			args: []string{"auth", "--help"},
			want: []string{"login", "whoami", "logout"},
		},
		{
			name: "auth whoami",
			args: []string{"auth", "whoami", "--help"},
			want: []string{"Print the current authenticated GitFuse identity", "gitfuse auth whoami"},
		},
		{
			name: "auth logout",
			args: []string{"auth", "logout", "--help"},
			want: []string{"Remove the local GitFuse session", "gitfuse auth logout"},
		},
		{
			name: "repo",
			args: []string{"repo", "--help"},
			want: []string{"list", "remove"},
		},
		{
			name: "repo list",
			args: []string{"repo", "list", "--help"},
			want: []string{"List tracked GitFuse repositories", "gitfuse repo list"},
		},
		{
			name: "repo remove",
			args: []string{"repo", "remove", "--help"},
			want: []string{"Remove a repository from local GitFuse tracking", "gitfuse repo remove <repo>"},
		},
		{
			name: "history",
			args: []string{"history", "--help"},
			want: []string{"Show GitFuse sync history and commit states", "gitfuse history"},
		},
		{
			name: "autosync",
			args: []string{"autosync", "--help"},
			want: []string{"enable", "disable", "status"},
		},
		{
			name: "autosync enable",
			args: []string{"autosync", "enable", "--help"},
			want: []string{"Enable automatic GitFuse sync for this repository", "gitfuse autosync enable"},
		},
		{
			name: "autosync disable",
			args: []string{"autosync", "disable", "--help"},
			want: []string{"Disable automatic GitFuse sync for this repository", "gitfuse autosync disable"},
		},
		{
			name: "autosync status",
			args: []string{"autosync", "status", "--help"},
			want: []string{"Show automatic GitFuse sync status for this repository", "gitfuse autosync status"},
		},
		{
			name: "legacy repos",
			args: []string{"repos", "--help"},
			want: []string{"Choose an active gitfuse repository", "gitfuse repos"},
		},
		{
			name: "legacy log",
			args: []string{"log", "--help"},
			want: []string{"Show gitfuse relay-side sync history and commit states", "gitfuse log"},
		},
		{
			name: "legacy start",
			args: []string{"start", "--help"},
			want: []string{"Start gitfuse automation for this repository", "gitfuse start"},
		},
		{
			name: "legacy pause",
			args: []string{"pause", "--help"},
			want: []string{"Pause gitfuse sync for this repository", "gitfuse pause"},
		},
		{
			name: "legacy resume",
			args: []string{"resume", "--help"},
			want: []string{"Resume gitfuse sync for this repository", "gitfuse resume"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			output, err := executeRootCommand(t, tc.args...)
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(output, want) {
					t.Fatalf("%v help output missing %q:\n%s", tc.args, want, output)
				}
			}
		})
	}
}

func TestFailedAuthDoesNotWritePartialCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "relay unavailable", http.StatusBadGateway)
	}))
	defer server.Close()

	configDir := filepath.Join(t.TempDir(), "config")
	t.Setenv("GITFUSE_CONFIG_DIR", configDir)
	t.Setenv("GITFUSE_RELAY_URL", server.URL)

	_, err := executeRootCommand(t, "auth", "--headless", "--code", "ABC123")
	if err == nil {
		t.Fatal("auth succeeded against failing relay")
	}
	if _, err := os.Stat(filepath.Join(configDir, "credentials")); !os.IsNotExist(err) {
		t.Fatalf("credentials file exists after failed auth: err=%v", err)
	}
}

func TestPreAuthCommandAllowList(t *testing.T) {
	for _, args := range [][]string{
		{"help"},
		{"version"},
		{"completion"},
		{"update"},
		{"config-dir"},
		{"doctor"},
		{"auth"},
		{"auth", "login"},
		{"auth", "whoami"},
		{"auth", "logout"},
	} {
		cmd, _, err := rootCmd.Find(args)
		if err != nil {
			t.Fatalf("Find(%v): %v", args, err)
		}
		if !isAllowedBeforeAuth(cmd) {
			t.Fatalf("%v should be allowed before auth", args)
		}
	}
}

func TestRelayURLResolutionPriorityAndValidation(t *testing.T) {
	t.Run("environment wins", func(t *testing.T) {
		withBuildMetadata(t, "1.2.3", "abc", "today", "https://build.example")
		t.Setenv("GITFUSE_RELAY_URL", "http://localhost:8787/")
		t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))

		resolved, err := resolveRelayURL()
		if err != nil {
			t.Fatal(err)
		}
		if resolved.URL != "http://localhost:8787" || resolved.Source != relayURLSourceEnvironment {
			t.Fatalf("resolved = %#v", resolved)
		}
	})

	t.Run("persisted config wins over build default", func(t *testing.T) {
		withBuildMetadata(t, "1.2.3", "abc", "today", "https://build.example")
		t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
		if err := config.PersistRelayURL("https://persisted.example/"); err != nil {
			t.Fatal(err)
		}

		resolved, err := resolveRelayURL()
		if err != nil {
			t.Fatal(err)
		}
		if resolved.URL != "https://persisted.example" || resolved.Source != relayURLSourcePersisted {
			t.Fatalf("resolved = %#v", resolved)
		}
	})

	t.Run("build default wins over development fallback", func(t *testing.T) {
		withBuildMetadata(t, "1.2.3", "abc", "today", "https://build.example/")
		t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))

		resolved, err := resolveRelayURL()
		if err != nil {
			t.Fatal(err)
		}
		if resolved.URL != "https://build.example" || resolved.Source != relayURLSourceBuild {
			t.Fatalf("resolved = %#v", resolved)
		}
	})

	t.Run("invalid scheme fails", func(t *testing.T) {
		t.Setenv("GITFUSE_RELAY_URL", "ftp://relay.example")
		if _, err := resolveRelayURL(); err == nil {
			t.Fatal("resolveRelayURL succeeded with ftp scheme")
		}
	})

	t.Run("localhost production URL is rejected", func(t *testing.T) {
		if err := validateProductionRelayURL("https://localhost:8787"); err == nil {
			t.Fatal("validateProductionRelayURL accepted localhost")
		}
	})
}

func TestDoctorDoesNotPrintCredentialSecrets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer server.Close()

	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_RELAY_URL", server.URL)
	const secretToken = "gf_secret_token_should_not_print"
	if _, err := config.WriteCredentials(config.Credentials{
		Username:     "doctor-user",
		Token:        secretToken,
		DeviceID:     "doctor-device",
		Key:          "secret-key-should-not-print",
		RegisteredAt: time.Unix(0, 0),
	}); err != nil {
		t.Fatal(err)
	}

	output, err := executeRootCommand(t, "doctor")
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{secretToken, "secret-key-should-not-print"} {
		if strings.Contains(output, secret) {
			t.Fatalf("doctor output leaked secret %q:\n%s", secret, output)
		}
	}
	if !strings.Contains(output, "PASS Relay health") {
		t.Fatalf("doctor output missing relay health pass:\n%s", output)
	}
}

func executeRootCommand(t *testing.T, args ...string) (string, error) {
	t.Helper()

	var output bytes.Buffer
	previousSilenceUsage := rootCmd.SilenceUsage
	previousSilenceErrors := rootCmd.SilenceErrors
	resetCommandFlags(rootCmd)
	rootCmd.SetArgs(args)
	rootCmd.SetOut(&output)
	rootCmd.SetErr(&output)
	rootCmd.SetIn(strings.NewReader(""))
	rootCmd.SilenceUsage = true
	rootCmd.SilenceErrors = true
	t.Cleanup(func() {
		rootCmd.SetArgs(nil)
		rootCmd.SetOut(os.Stdout)
		rootCmd.SetErr(os.Stderr)
		rootCmd.SetIn(os.Stdin)
		rootCmd.SilenceUsage = previousSilenceUsage
		rootCmd.SilenceErrors = previousSilenceErrors
		resetCommandFlags(rootCmd)
	})

	err := rootCmd.Execute()
	return output.String(), err
}

func resetCommandFlags(cmd *cobra.Command) {
	resetFlagSet(cmd.Flags())
	resetFlagSet(cmd.PersistentFlags())
	for _, child := range cmd.Commands() {
		resetCommandFlags(child)
	}
}

func resetFlagSet(flags *pflag.FlagSet) {
	flags.VisitAll(func(flag *pflag.Flag) {
		_ = flag.Value.Set(flag.DefValue)
		flag.Changed = false
	})
}

func withBuildMetadata(t *testing.T, testVersion, testCommit, testBuildDate, testDefaultRelayURL string) {
	t.Helper()
	previousVersion := version
	previousCommit := commit
	previousBuildDate := buildDate
	previousDefaultRelayURL := defaultRelayURL

	version = testVersion
	commit = testCommit
	buildDate = testBuildDate
	defaultRelayURL = testDefaultRelayURL
	rootCmd.Version = currentCLIVersion()
	rootCmd.SetVersionTemplate(renderVersionOutput())

	t.Cleanup(func() {
		version = previousVersion
		commit = previousCommit
		buildDate = previousBuildDate
		defaultRelayURL = previousDefaultRelayURL
		rootCmd.Version = currentCLIVersion()
		rootCmd.SetVersionTemplate(renderVersionOutput())
	})
}
