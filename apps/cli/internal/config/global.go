package config

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

const globalDirName = ".gitfuse"

func GlobalDir() (string, error) {
	if override := os.Getenv("GITFUSE_HOME"); override != "" {
		return filepath.Clean(override), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, globalDirName), nil
}

func EnsureGlobalDir() (string, error) {
	dir, err := GlobalDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create gitfuse config directory: %w", err)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", fmt.Errorf("secure gitfuse config directory: %w", err)
	}
	return dir, nil
}

type Credentials struct {
	Username     string
	Token        string
	DeviceID     string
	Key          string
	RegisteredAt time.Time
}

func CredentialsPath() (string, error) {
	dir, err := EnsureGlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "credentials"), nil
}

func DeviceIDPath() (string, error) {
	dir, err := EnsureGlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "device_id"), nil
}

func EnsureDeviceID() (string, error) {
	path, err := DeviceIDPath()
	if err != nil {
		return "", err
	}
	if content, err := os.ReadFile(path); err == nil {
		deviceID := regexp.MustCompile(`\s+`).ReplaceAllString(string(content), "")
		if deviceID != "" {
			return deviceID, nil
		}
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate device id: %w", err)
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	deviceID := fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(deviceID+"\n"), 0o600); err != nil {
		return "", fmt.Errorf("write device id temp file: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("commit device id file: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return "", fmt.Errorf("secure device id file: %w", err)
	}
	return deviceID, nil
}

func WriteCredentials(credentials Credentials) (string, error) {
	path, err := CredentialsPath()
	if err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	content := fmt.Sprintf("[account]\nusername = %q\ntoken = %q\ndevice_id = %q\nkey = %q\nregistered_at = %q\n",
		credentials.Username,
		credentials.Token,
		credentials.DeviceID,
		credentials.Key,
		credentials.RegisteredAt.UTC().Format(time.RFC3339),
	)
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write credentials temp file: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("commit credentials file: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return "", fmt.Errorf("secure credentials file: %w", err)
	}
	return path, nil
}

func ReadCredentials() (Credentials, error) {
	path, err := CredentialsPath()
	if err != nil {
		return Credentials{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return Credentials{}, err
	}
	text := string(content)
	registeredAt, _ := time.Parse(time.RFC3339, globalTomlString(text, "registered_at"))
	return Credentials{
		Username:     globalTomlString(text, "username"),
		Token:        globalTomlString(text, "token"),
		DeviceID:     globalTomlString(text, "device_id"),
		Key:          globalTomlString(text, "key"),
		RegisteredAt: registeredAt,
	}, nil
}

type RegistryEntry struct {
	Name         string   `json:"name"`
	Path         string   `json:"path"`
	RootSHA      string   `json:"rootSha"`
	RelayEntryID string   `json:"relayEntryId"`
	RemoteURL    string   `json:"remoteUrl"`
	DeviceID     string   `json:"deviceId"`
	History      []string `json:"history,omitempty"`
	UpdatedAt    string   `json:"updatedAt"`
}

type RepositoryRegistry struct {
	ActiveRelayEntryID string          `json:"activeRelayEntryId,omitempty"`
	Entries            []RegistryEntry `json:"entries"`
}

func RepositoryRegistryPath() (string, error) {
	dir, err := EnsureGlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "repositories.json"), nil
}

func ReadRepositoryRegistry() (RepositoryRegistry, error) {
	path, err := RepositoryRegistryPath()
	if err != nil {
		return RepositoryRegistry{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return RepositoryRegistry{Entries: []RegistryEntry{}}, nil
		}
		return RepositoryRegistry{}, err
	}
	var registry RepositoryRegistry
	if err := json.Unmarshal(content, &registry); err != nil {
		return RepositoryRegistry{}, fmt.Errorf("decode repository registry: %w", err)
	}
	if registry.Entries == nil {
		registry.Entries = []RegistryEntry{}
	}
	return registry, nil
}

func WriteRepositoryRegistry(registry RepositoryRegistry) (string, error) {
	path, err := RepositoryRegistryPath()
	if err != nil {
		return "", err
	}
	if registry.Entries == nil {
		registry.Entries = []RegistryEntry{}
	}
	content, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode repository registry: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(content, '\n'), 0o600); err != nil {
		return "", fmt.Errorf("write repository registry temp file: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("commit repository registry file: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return "", fmt.Errorf("secure repository registry file: %w", err)
	}
	return path, nil
}

func UpsertRepositoryRegistryEntry(entry RegistryEntry) (RepositoryRegistry, error) {
	registry, err := ReadRepositoryRegistry()
	if err != nil {
		return RepositoryRegistry{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	entry.UpdatedAt = now
	replaced := false
	for i, existing := range registry.Entries {
		if existing.Path == entry.Path || existing.RelayEntryID == entry.RelayEntryID {
			if len(entry.History) == 0 {
				entry.History = existing.History
			}
			registry.Entries[i] = entry
			replaced = true
			break
		}
	}
	if !replaced {
		registry.Entries = append(registry.Entries, entry)
	}
	registry.ActiveRelayEntryID = entry.RelayEntryID
	if _, err := WriteRepositoryRegistry(registry); err != nil {
		return RepositoryRegistry{}, err
	}
	return registry, nil
}

type ActiveRepo struct {
	Name string
	Path string
}

func ActiveRepoPath() (string, error) {
	dir, err := EnsureGlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "active_repo"), nil
}

func WriteActiveRepo(repo ActiveRepo) (string, error) {
	path, err := ActiveRepoPath()
	if err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	content := fmt.Sprintf("[repo]\nname = %q\npath = %q\n", repo.Name, repo.Path)
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write active repo temp file: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("commit active repo file: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return "", fmt.Errorf("secure active repo file: %w", err)
	}
	return path, nil
}

func ReadActiveRepo() (ActiveRepo, error) {
	path, err := ActiveRepoPath()
	if err != nil {
		return ActiveRepo{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return ActiveRepo{}, err
	}
	text := string(content)
	return ActiveRepo{
		Name: globalTomlString(text, "name"),
		Path: globalTomlString(text, "path"),
	}, nil
}

func globalTomlString(text, key string) string {
	match := regexp.MustCompile(key + `\s*=\s*"([^"]*)"`).FindStringSubmatch(text)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}
