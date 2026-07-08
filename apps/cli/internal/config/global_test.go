package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGlobalDirDefaultsToHomeGitfuse(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("GITFUSE_CONFIG_DIR", "")
	t.Setenv("GITFUSE_HOME", "")
	os.Unsetenv("GITFUSE_CONFIG_DIR")
	os.Unsetenv("GITFUSE_HOME")

	dir, err := GlobalDir()
	if err != nil {
		t.Fatal(err)
	}
	if dir != filepath.Join(home, ".gitfuse") {
		t.Fatalf("GlobalDir() = %q, want home .gitfuse", dir)
	}
}

func TestGlobalDirUsesGitfuseConfigDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "device one")
	t.Setenv("GITFUSE_CONFIG_DIR", dir)

	got, err := GlobalDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean(dir) {
		t.Fatalf("GlobalDir() = %q, want %q", got, filepath.Clean(dir))
	}
}

func TestGlobalDirResolvesRelativeGitfuseConfigDir(t *testing.T) {
	base := t.TempDir()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(base); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(previous); err != nil {
			t.Fatal(err)
		}
	})
	t.Setenv("GITFUSE_CONFIG_DIR", "relative device")

	got, err := GlobalDir()
	if err != nil {
		t.Fatal(err)
	}
	want, err := filepath.Abs("relative device")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("GlobalDir() = %q, want %q", got, want)
	}
}

func TestGlobalDirRejectsWhitespaceOverride(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", "   ")

	if _, err := GlobalDir(); err == nil {
		t.Fatal("GlobalDir() succeeded with whitespace override")
	}
}

func TestResolvingGlobalPathsDoesNotCreateDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "fresh")
	t.Setenv("GITFUSE_CONFIG_DIR", dir)

	if _, err := CredentialsPath(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("config dir exists after path resolution: err=%v", err)
	}
}

func TestWriteCredentialsCreatesGlobalDirAndKeepsDevicesSeparate(t *testing.T) {
	first := filepath.Join(t.TempDir(), "first")
	second := filepath.Join(t.TempDir(), "second")

	t.Setenv("GITFUSE_CONFIG_DIR", first)
	if _, err := WriteCredentials(Credentials{
		Username:     "one",
		Token:        "token-one",
		DeviceID:     "device-one",
		Key:          "key-one",
		RegisteredAt: time.Unix(0, 0),
	}); err != nil {
		t.Fatal(err)
	}

	t.Setenv("GITFUSE_CONFIG_DIR", second)
	if _, err := WriteCredentials(Credentials{
		Username:     "two",
		Token:        "token-two",
		DeviceID:     "device-two",
		Key:          "key-two",
		RegisteredAt: time.Unix(0, 0),
	}); err != nil {
		t.Fatal(err)
	}

	firstContent, err := os.ReadFile(filepath.Join(first, "credentials"))
	if err != nil {
		t.Fatal(err)
	}
	secondContent, err := os.ReadFile(filepath.Join(second, "credentials"))
	if err != nil {
		t.Fatal(err)
	}
	if string(firstContent) == string(secondContent) {
		t.Fatal("separate config directories wrote identical credential contents")
	}
}

func TestGitfuseConfigDirDoesNotRedirectRepositoryLocalMetadata(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "global"))
	repo := filepath.Join(t.TempDir(), "repo")

	if _, err := WriteLocalConfig(repo, LocalConfig{RootSHA: "root", RelayEntryID: "relay"}); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(repo, ".gitfuse", "config")); err != nil {
		t.Fatal(err)
	}
}
