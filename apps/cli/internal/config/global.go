package config

import (
	"fmt"
	"os"
	"path/filepath"
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
