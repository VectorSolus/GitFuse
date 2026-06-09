package config

import (
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

func WriteCredentials(credentials Credentials) (string, error) {
	path, err := CredentialsPath()
	if err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	content := fmt.Sprintf("[account]\nusername = %q\ntoken = %q\nkey = %q\nregistered_at = %q\n",
		credentials.Username,
		credentials.Token,
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
