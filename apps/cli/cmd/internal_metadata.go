package cmd

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var gitfuseMetadataPaths = []string{".gitfuse/config", ".gitfuse/ledger"}

func protectGitfuseMetadata(repoPath string) error {
	if err := ensureGitfuseMetadataIgnored(repoPath); err != nil {
		return err
	}
	return unstageGitfuseMetadata(repoPath)
}

func ensureGitfuseMetadataIgnored(repoPath string) error {
	ignored, err := gitfuseMetadataIgnored(repoPath)
	if err != nil {
		return err
	}
	if ignored {
		return nil
	}

	excludePath, err := gitInfoExcludePath(repoPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(excludePath), 0o755); err != nil {
		return err
	}
	existing, err := os.ReadFile(excludePath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if strings.Contains(string(existing), ".gitfuse/") {
		return nil
	}
	file, err := os.OpenFile(excludePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	if len(existing) > 0 && !strings.HasSuffix(string(existing), "\n") {
		if _, err := file.WriteString("\n"); err != nil {
			return err
		}
	}
	_, err = file.WriteString(".gitfuse/\n")
	return err
}

func gitfuseMetadataIgnored(repoPath string) (bool, error) {
	cmd := exec.Command("git", "-C", repoPath, "check-ignore", "-q", "--", ".gitfuse/config")
	err := cmd.Run()
	if err == nil {
		return true, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
		return false, nil
	}
	return false, fmt.Errorf("git check-ignore .gitfuse/config failed: %w", err)
}

func gitInfoExcludePath(repoPath string) (string, error) {
	output, err := gitOutput(repoPath, "rev-parse", "--git-path", "info/exclude")
	if err != nil {
		return "", err
	}
	path := strings.TrimSpace(output)
	if path == "" {
		return "", fmt.Errorf("git info exclude path is empty")
	}
	if filepath.IsAbs(path) {
		return filepath.Clean(path), nil
	}
	return filepath.Clean(filepath.Join(repoPath, path)), nil
}

func unstageGitfuseMetadata(repoPath string) error {
	staged, err := stagedGitfuseMetadata(repoPath)
	if err != nil {
		return err
	}
	if len(staged) == 0 {
		return nil
	}
	for _, path := range staged {
		tracked, err := pathExistsInHead(repoPath, path)
		if err != nil {
			return err
		}
		if tracked {
			return fmt.Errorf("%s is tracked by Git. Remove GitFuse internal metadata from the index before running GitFuse commands", path)
		}
	}
	args := append([]string{"rm", "--cached", "--quiet", "--ignore-unmatch", "--"}, staged...)
	return runGit(repoPath, args...)
}

func stagedGitfuseMetadata(repoPath string) ([]string, error) {
	args := append([]string{"diff", "--cached", "--name-only", "--"}, gitfuseMetadataPaths...)
	output, err := gitOutput(repoPath, args...)
	if err != nil {
		return nil, err
	}
	var staged []string
	for _, line := range strings.Split(output, "\n") {
		path := strings.TrimSpace(line)
		if path == "" {
			continue
		}
		for _, metadataPath := range gitfuseMetadataPaths {
			if path == metadataPath {
				staged = append(staged, path)
				break
			}
		}
	}
	return staged, nil
}

func pathExistsInHead(repoPath, path string) (bool, error) {
	cmd := exec.Command("git", "-C", repoPath, "cat-file", "-e", "HEAD:"+path)
	err := cmd.Run()
	if err == nil {
		return true, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return false, nil
	}
	return false, fmt.Errorf("git cat-file HEAD:%s failed: %w", path, err)
}
