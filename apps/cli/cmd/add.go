package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add .",
	Short: "Register a committed git repository with gitfuse",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if args[0] != "." {
			return fmt.Errorf("gitfuse add currently accepts only '.'")
		}
		return runAdd(cmd.Context(), cmd)
	},
}

func init() {
	rootCmd.AddCommand(addCmd)
}

func runAdd(ctx context.Context, cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
		return err
	}
	rootSHA, err := gfgit.RootSHA(repoPath)
	if err != nil {
		return err
	}
	displayName := filepath.Base(repoPath)
	relayEntryID, account, remoteURL := registerRepoIfPossible(ctx, rootSHA, displayName)
	if relayEntryID == "" {
		relayEntryID = "local-" + rootSHA[:12]
	}

	if _, err := config.WriteLocalConfig(repoPath, config.LocalConfig{
		RootSHA:      rootSHA,
		RelayEntryID: relayEntryID,
		Account:      account,
		DisplayName:  displayName,
		RemoteURL:    remoteURL,
		Platform:     detectPlatform(remoteURL),
	}); err != nil {
		return err
	}
	if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{}); err != nil {
		return err
	}
	if err := ensureGitignore(repoPath); err != nil {
		return err
	}
	if err := stageGitfuseFiles(repoPath); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Registered %s with gitfuse.\n", displayName)
	return nil
}

func ensureGitignore(repoPath string) error {
	path := filepath.Join(repoPath, ".gitignore")
	existing, _ := os.ReadFile(path)
	text := string(existing)
	lines := []string{".gitfuse/queue/", ".gitfuse/snapshots/", ".gitfuse/backup/"}
	var missing []string
	for _, line := range lines {
		if !strings.Contains(text, line) {
			missing = append(missing, line)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	if text != "" && !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	text += strings.Join(missing, "\n") + "\n"
	return os.WriteFile(path, []byte(text), 0o644)
}

func stageGitfuseFiles(repoPath string) error {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return err
	}
	worktree, err := repo.Worktree()
	if err != nil {
		return err
	}
	for _, path := range []string{".gitfuse/config", ".gitfuse/ledger"} {
		if _, err := worktree.Add(path); err != nil {
			return err
		}
	}
	return nil
}

func registerRepoIfPossible(ctx context.Context, rootSHA, displayName string) (relayEntryID, account, remoteURL string) {
	relayURL := os.Getenv("GITFUSE_RELAY_URL")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL == "" || token == "" {
		return "", "", ""
	}
	payload, _ := json.Marshal(map[string]string{
		"rootSha":     rootSHA,
		"displayName": displayName,
		"remoteUrl":   "",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, relayURL+"/v1/repos", bytes.NewReader(payload))
	if err != nil {
		return "", "", ""
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", ""
	}
	defer resp.Body.Close()
	var decoded struct {
		Repository struct {
			RelayEntryID string `json:"relayEntryId"`
			RemoteURL    string `json:"remoteUrl"`
		} `json:"repository"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return "", "", ""
	}
	return decoded.Repository.RelayEntryID, "", decoded.Repository.RemoteURL
}

func detectPlatform(remoteURL string) string {
	switch {
	case strings.Contains(remoteURL, "github"):
		return "github"
	case strings.Contains(remoteURL, "gitlab"):
		return "gitlab"
	case strings.Contains(remoteURL, "bitbucket"):
		return "bitbucket"
	default:
		return ""
	}
}
