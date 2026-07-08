package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

type releaseInfo struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Check for and install a newer gitfuse release",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runUpdate(cmd.Context(), cmd)
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}

func runUpdate(ctx context.Context, cmd *cobra.Command) error {
	release, err := latestRelease(ctx)
	if err != nil {
		return err
	}
	latest := strings.TrimPrefix(release.TagName, "v")
	currentVersion := currentCLIVersion()
	if !versionGreater(latest, currentVersion) {
		fmt.Fprintf(cmd.OutOrStdout(), "gitfuse %s is already the latest version.\n", currentVersion)
		return nil
	}
	target := os.Getenv("GITFUSE_UPDATE_TARGET")
	if target == "" {
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		target = exe
	}
	if payload := os.Getenv("GITFUSE_UPDATE_PAYLOAD"); payload != "" {
		if err := replaceBinary(target, []byte(payload)); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Updated gitfuse from %s to %s.\n", currentVersion, latest)
		return nil
	}
	assetURL := firstAssetURL(release)
	if assetURL == "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Update available: %s. Download it from GitHub releases.\n", latest)
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, assetURL, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download release asset failed with status %d", resp.StatusCode)
	}
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if err := replaceBinary(target, payload); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Updated gitfuse from %s to %s.\n", currentVersion, latest)
	return nil
}

func latestRelease(ctx context.Context) (releaseInfo, error) {
	if fixture := os.Getenv("GITFUSE_RELEASE_FIXTURE"); fixture != "" {
		content, err := os.ReadFile(fixture)
		if err != nil {
			return releaseInfo{}, err
		}
		var release releaseInfo
		return release, json.Unmarshal(content, &release)
	}
	url := os.Getenv("GITFUSE_RELEASE_URL")
	if url == "" {
		url = "https://api.github.com/repos/gitfuse/gitfuse/releases/latest"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return releaseInfo{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return releaseInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return releaseInfo{}, fmt.Errorf("release check failed with status %d", resp.StatusCode)
	}
	var release releaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return releaseInfo{}, err
	}
	return release, nil
}

func firstAssetURL(release releaseInfo) string {
	for _, asset := range release.Assets {
		if asset.BrowserDownloadURL != "" {
			return asset.BrowserDownloadURL
		}
	}
	return ""
}

func replaceBinary(path string, payload []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o755); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Chmod(path, 0o755)
}

func versionGreater(candidate, current string) bool {
	candidateParts := versionParts(candidate)
	currentParts := versionParts(current)
	for i := 0; i < 3; i++ {
		if candidateParts[i] > currentParts[i] {
			return true
		}
		if candidateParts[i] < currentParts[i] {
			return false
		}
	}
	return false
}

func versionParts(version string) [3]int {
	version = strings.TrimPrefix(version, "v")
	parts := strings.Split(version, ".")
	var parsed [3]int
	for i := 0; i < len(parts) && i < 3; i++ {
		value, _ := strconv.Atoi(parts[i])
		parsed[i] = value
	}
	return parsed
}
