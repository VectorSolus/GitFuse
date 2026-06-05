package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

type LocalConfig struct {
	RootSHA      string
	RelayEntryID string
	Account      string
	DisplayName  string
	RemoteURL    string
	Platform     string
}

func GitfuseDir(repoPath string) string {
	return filepath.Join(repoPath, ".gitfuse")
}

func WriteLocalConfig(repoPath string, cfg LocalConfig) (string, error) {
	path := filepath.Join(GitfuseDir(repoPath), "config")
	content := fmt.Sprintf(`[identity]
root_sha = %q
relay_entry_id = %q
account = %q
display_name = %q

[remote]
url = %q
platform = %q

[sync]
last_synced_at = %q
last_synced_device = %q
`,
		cfg.RootSHA,
		cfg.RelayEntryID,
		cfg.Account,
		cfg.DisplayName,
		cfg.RemoteURL,
		cfg.Platform,
		"",
		"",
	)
	return WriteLocalFile(path, []byte(content), 0o644)
}

func WriteLocalFile(path string, content []byte, mode os.FileMode) (string, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, content, mode); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	if err := os.Chmod(path, mode); err != nil {
		return "", err
	}
	return path, nil
}

func ReadLocalConfig(repoPath string) (LocalConfig, error) {
	path := filepath.Join(GitfuseDir(repoPath), "config")
	content, err := os.ReadFile(path)
	if err != nil {
		return LocalConfig{}, err
	}
	text := string(content)
	return LocalConfig{
		RootSHA:      localTomlString(text, "root_sha"),
		RelayEntryID: localTomlString(text, "relay_entry_id"),
		Account:      localTomlString(text, "account"),
		DisplayName:  localTomlString(text, "display_name"),
		RemoteURL:    localTomlString(text, "url"),
		Platform:     localTomlString(text, "platform"),
	}, nil
}

func localTomlString(text, key string) string {
	match := regexp.MustCompile(key + `\s*=\s*"([^"]*)"`).FindStringSubmatch(text)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}
