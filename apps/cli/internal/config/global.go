package config

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const globalDirName = ".gitfuse"

func GlobalDir() (string, error) {
	if override, ok := os.LookupEnv("GITFUSE_CONFIG_DIR"); ok {
		return normalizeGlobalDirOverride("GITFUSE_CONFIG_DIR", override)
	}

	if override := os.Getenv("GITFUSE_HOME"); override != "" {
		return normalizeGlobalDirOverride("GITFUSE_HOME", override)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, globalDirName), nil
}

func normalizeGlobalDirOverride(name, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s must not be empty", name)
	}
	cleaned := filepath.Clean(trimmed)
	if filepath.IsAbs(cleaned) {
		return cleaned, nil
	}
	absolute, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", name, err)
	}
	return filepath.Clean(absolute), nil
}

func EnsureGlobalDir() (string, error) {
	dir, err := GlobalDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create gitfuse config directory: %w", err)
	}
	if err := securePath(dir, 0o700); err != nil {
		return "", fmt.Errorf("secure gitfuse config directory: %w", err)
	}
	return dir, nil
}

func globalPath(name string) (string, error) {
	dir, err := GlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, name), nil
}

func ensuredGlobalPath(name string) (string, error) {
	dir, err := EnsureGlobalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, name), nil
}

func securePath(path string, mode os.FileMode) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	return os.Chmod(path, mode)
}

func writeGlobalFileAtomic(path string, content []byte, mode os.FileMode) error {
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, content, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return securePath(path, mode)
}

type Credentials struct {
	Username     string
	Token        string
	DeviceID     string
	Key          string
	RegisteredAt time.Time
}

func CredentialsPath() (string, error) {
	return globalPath("credentials")
}

func RemoveCredentials() error {
	path, err := CredentialsPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove credentials: %w", err)
	}
	return nil
}

func DeviceIDPath() (string, error) {
	return globalPath("device_id")
}

func EnsureDeviceID() (string, error) {
	deviceID, err := ReadDeviceID()
	if err == nil {
		return deviceID, nil
	}
	if !os.IsNotExist(err) {
		return "", err
	}
	deviceID, err = GenerateDeviceID()
	if err != nil {
		return "", err
	}
	return deviceID, WriteDeviceID(deviceID)
}

func ReadDeviceID() (string, error) {
	path, err := DeviceIDPath()
	if err != nil {
		return "", err
	}
	if content, err := os.ReadFile(path); err == nil {
		deviceID := regexp.MustCompile(`\s+`).ReplaceAllString(string(content), "")
		if deviceID != "" {
			return deviceID, nil
		}
		return "", fmt.Errorf("device id file is empty")
	} else {
		return "", err
	}
}

func GenerateDeviceID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate device id: %w", err)
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16]), nil
}

func WriteDeviceID(deviceID string) error {
	path, err := ensuredGlobalPath("device_id")
	if err != nil {
		return err
	}
	if err := writeGlobalFileAtomic(path, []byte(strings.TrimSpace(deviceID)+"\n"), 0o600); err != nil {
		return fmt.Errorf("write device id file: %w", err)
	}
	return nil
}

func WriteCredentials(credentials Credentials) (string, error) {
	path, err := ensuredGlobalPath("credentials")
	if err != nil {
		return "", err
	}
	content := fmt.Sprintf("[account]\nusername = %q\ntoken = %q\ndevice_id = %q\nkey = %q\nregistered_at = %q\n",
		credentials.Username,
		credentials.Token,
		credentials.DeviceID,
		credentials.Key,
		credentials.RegisteredAt.UTC().Format(time.RFC3339),
	)
	if err := writeGlobalFileAtomic(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write credentials temp file: %w", err)
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
	return globalPath("repositories.json")
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
	path, err := ensuredGlobalPath("repositories.json")
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
	if err := writeGlobalFileAtomic(path, append(content, '\n'), 0o600); err != nil {
		return "", fmt.Errorf("write repository registry temp file: %w", err)
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

func RemoveRepositoryRegistryEntry(match func(RegistryEntry) bool) (RepositoryRegistry, []RegistryEntry, error) {
	registry, err := ReadRepositoryRegistry()
	if err != nil {
		return RepositoryRegistry{}, nil, err
	}
	kept := make([]RegistryEntry, 0, len(registry.Entries))
	removed := make([]RegistryEntry, 0, 1)
	for _, entry := range registry.Entries {
		if match(entry) {
			removed = append(removed, entry)
			continue
		}
		kept = append(kept, entry)
	}
	registry.Entries = kept
	if registry.ActiveRelayEntryID != "" {
		for _, entry := range removed {
			if entry.RelayEntryID == registry.ActiveRelayEntryID {
				registry.ActiveRelayEntryID = ""
				break
			}
		}
	}
	if len(removed) > 0 {
		if _, err := WriteRepositoryRegistry(registry); err != nil {
			return RepositoryRegistry{}, nil, err
		}
	}
	return registry, removed, nil
}

type ActiveRepo struct {
	Name string
	Path string
}

type GlobalConfig struct {
	RelayURL string `json:"relayUrl,omitempty"`
}

func GlobalConfigPath() (string, error) {
	return globalPath("config.json")
}

func ReadGlobalConfig() (GlobalConfig, error) {
	path, err := GlobalConfigPath()
	if err != nil {
		return GlobalConfig{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return GlobalConfig{}, nil
		}
		return GlobalConfig{}, err
	}
	var cfg GlobalConfig
	if err := json.Unmarshal(content, &cfg); err != nil {
		return GlobalConfig{}, fmt.Errorf("decode global config: %w", err)
	}
	return cfg, nil
}

func WriteGlobalConfig(cfg GlobalConfig) (string, error) {
	path, err := ensuredGlobalPath("config.json")
	if err != nil {
		return "", err
	}
	content, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode global config: %w", err)
	}
	if err := writeGlobalFileAtomic(path, append(content, '\n'), 0o600); err != nil {
		return "", fmt.Errorf("write global config: %w", err)
	}
	return path, nil
}

func PersistRelayURL(relayURL string) error {
	cfg, err := ReadGlobalConfig()
	if err != nil {
		return err
	}
	cfg.RelayURL = strings.TrimSpace(relayURL)
	_, err = WriteGlobalConfig(cfg)
	return err
}

func ActiveRepoPath() (string, error) {
	return globalPath("active_repo")
}

func WriteActiveRepo(repo ActiveRepo) (string, error) {
	path, err := ensuredGlobalPath("active_repo")
	if err != nil {
		return "", err
	}
	content := fmt.Sprintf("[repo]\nname = %q\npath = %q\n", repo.Name, repo.Path)
	if err := writeGlobalFileAtomic(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write active repo temp file: %w", err)
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

func RemoveActiveRepo() error {
	path, err := ActiveRepoPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove active repo: %w", err)
	}
	return nil
}

func globalTomlString(text, key string) string {
	match := regexp.MustCompile(key + `\s*=\s*"([^"]*)"`).FindStringSubmatch(text)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}
