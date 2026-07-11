package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

var restoreCmd = &cobra.Command{
	Use:   "restore <relay-entry-name>",
	Short: "Restore a missing project from relay bundles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRestore(cmd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(restoreCmd)
}

func runRestore(cmd *cobra.Command, name string) error {
	repos, err := loadRelayRepositories()
	if err != nil {
		return err
	}
	relayRepo, ok := findRelayRepository(name, repos)
	if !ok {
		return fmt.Errorf("relay entry %q not found", name)
	}
	target, removeTargetOnFailure, err := resolveRestoreTarget(relayRepo.DisplayName)
	if err != nil {
		return err
	}

	ctx := cmd.Context()
	if ctx == nil {
		ctx = context.Background()
	}
	bundles, err := downloadRestoreBundles(ctx, relayRepo)
	if err != nil {
		return err
	}

	restoreCommitted := false
	defer func() {
		if !restoreCommitted {
			rollbackRestoreTarget(target, removeTargetOnFailure)
		}
	}()

	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	if err := runGit(target, "init"); err != nil {
		return err
	}
	if err := excludeGitfuseMetadata(target); err != nil {
		return err
	}

	restoredRef, restoredHead, commitCount, err := importRestoreBundles(target, bundles)
	if err != nil {
		return err
	}
	if commitCount == 0 {
		return fmt.Errorf("restore failed: no commits were imported")
	}
	if err := validateRestoredGit(target, restoredRef); err != nil {
		return err
	}
	if err := writeRestoreMetadata(target, relayRepo, restoredHead); err != nil {
		return err
	}
	if err := validateGitfuseUntracked(target); err != nil {
		return err
	}
	if err := registerRestoredRepository(target, relayRepo); err != nil {
		return err
	}

	restoreCommitted = true
	if progress := tui.ReplayProgress(commitCount); progress != "" {
		fmt.Fprintln(cmd.OutOrStdout(), progress)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Restored %s at %s.\n", relayRepo.DisplayName, target)
	if relayRepo.RemoteURL != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Remote available: %s\n", relayRepo.RemoteURL)
	} else {
		fmt.Fprintln(cmd.OutOrStdout(), "No remote stored. Run 'gitfuse init' to create one.")
	}
	return nil
}

type relayBundleRow struct {
	ID             string                 `json:"id"`
	RepositoryID   string                 `json:"repositoryId"`
	DeviceID       string                 `json:"deviceId"`
	BundleHash     string                 `json:"bundleHash"`
	CommitCount    int                    `json:"commitCount"`
	SizeBytes      int64                  `json:"sizeBytes"`
	R2Key          string                 `json:"r2Key"`
	Status         string                 `json:"status"`
	ParentBundleID string                 `json:"parentBundleId"`
	CreatedAt      string                 `json:"createdAt"`
	ExpiresAt      string                 `json:"expiresAt"`
	HeadSHA        string                 `json:"headSha,omitempty"`
	HeadSHAUpper   string                 `json:"headSHA,omitempty"`
	HeadSHASnake   string                 `json:"head_sha,omitempty"`
	Commits        []relayBundleCommitRow `json:"commits,omitempty"`
}

type relayBundleCommitRow struct {
	SHA string `json:"sha"`
}

type downloadedRestoreBundle struct {
	row      relayBundleRow
	manifest gfgit.BundleManifest
	native   []byte
}

type bundleHead struct {
	Hash string
	Ref  string
}

func resolveRestoreTarget(displayName string) (string, bool, error) {
	parent, err := os.Getwd()
	if err != nil {
		return "", false, err
	}
	if filepath.Base(parent) == displayName {
		empty, err := isDirEmpty(parent)
		if err != nil {
			return "", false, err
		}
		if !empty {
			return "", false, fmt.Errorf("restore target %s already exists and is not empty", parent)
		}
		return parent, false, nil
	}

	target := filepath.Join(parent, displayName)
	info, err := os.Stat(target)
	if err == nil {
		if !info.IsDir() {
			return "", false, fmt.Errorf("restore target %s exists and is not a directory", target)
		}
		empty, err := isDirEmpty(target)
		if err != nil {
			return "", false, err
		}
		if !empty {
			return "", false, fmt.Errorf("restore target %s already exists and is not empty", target)
		}
		return target, true, nil
	}
	if !os.IsNotExist(err) {
		return "", false, err
	}
	return target, true, nil
}

func isDirEmpty(path string) (bool, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false, err
	}
	return len(entries) == 0, nil
}

func rollbackRestoreTarget(target string, removeTarget bool) {
	if target == "" {
		return
	}
	if removeTarget {
		_ = os.RemoveAll(target)
		return
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return
	}
	for _, entry := range entries {
		_ = os.RemoveAll(filepath.Join(target, entry.Name()))
	}
}

func downloadRestoreBundles(ctx context.Context, repo relayRepository) ([]downloadedRestoreBundle, error) {
	rows, err := loadRestoreBundleRows(ctx, repo.RelayEntryID)
	if err != nil {
		return nil, err
	}
	activeRows, err := selectRestorableBundleRows(repo.DisplayName, rows)
	if err != nil {
		return nil, err
	}
	bundles := make([]downloadedRestoreBundle, 0, len(activeRows))
	for _, row := range activeRows {
		bundle, err := downloadRestoreBundle(ctx, repo, row)
		if err != nil {
			return nil, err
		}
		bundles = append(bundles, bundle)
	}
	return bundles, nil
}

func loadRestoreBundleRows(ctx context.Context, relayEntryID string) ([]relayBundleRow, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, relayBaseURL()+"/v1/bundles/"+relayEntryID, nil)
	if err != nil {
		return nil, err
	}
	body, status, err := doAuthorizedRequest(req)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNoContent {
		return nil, nil
	}
	var decoded struct {
		Bundles []relayBundleRow `json:"bundles"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, err
	}
	return decoded.Bundles, nil
}

func selectRestorableBundleRows(repoName string, rows []relayBundleRow) ([]relayBundleRow, error) {
	if len(rows) == 0 {
		return nil, fmt.Errorf("No restorable bundles are available for %s.", repoName)
	}
	now := time.Now()
	onlyExpired := false
	active := make([]relayBundleRow, 0, len(rows))
	for _, row := range rows {
		status := strings.ToLower(strings.TrimSpace(row.Status))
		if status == "expired" {
			onlyExpired = true
			continue
		}
		if status != "" && status != "active" {
			continue
		}
		if row.ExpiresAt != "" {
			expiresAt, err := time.Parse(time.RFC3339, row.ExpiresAt)
			if err != nil {
				return nil, fmt.Errorf("bundle metadata for %s has invalid expiresAt %q", repoName, row.ExpiresAt)
			}
			if !expiresAt.After(now) {
				onlyExpired = true
				continue
			}
		}
		active = append(active, row)
	}
	if len(active) == 0 {
		if onlyExpired {
			return nil, fmt.Errorf("The relay history for %s has expired and cannot be restored.", repoName)
		}
		return nil, fmt.Errorf("No restorable bundles are available for %s.", repoName)
	}
	sort.Slice(active, func(i, j int) bool {
		left, leftErr := time.Parse(time.RFC3339, active[i].CreatedAt)
		right, rightErr := time.Parse(time.RFC3339, active[j].CreatedAt)
		if leftErr != nil || rightErr != nil {
			return active[i].ID < active[j].ID
		}
		return left.Before(right)
	})
	return active, nil
}

func downloadRestoreBundle(ctx context.Context, repo relayRepository, row relayBundleRow) (downloadedRestoreBundle, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, relayBaseURL()+"/v1/bundles/"+row.ID+"/download", nil)
	if err != nil {
		return downloadedRestoreBundle{}, err
	}
	token := deviceToken()
	if token == "" {
		return downloadedRestoreBundle{}, fmt.Errorf("not authenticated; run 'gitfuse auth'")
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return downloadedRestoreBundle{}, fmt.Errorf("download bundle %s: %w", row.ID, err)
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return downloadedRestoreBundle{}, readErr
	}
	if resp.StatusCode == http.StatusNotFound {
		return downloadedRestoreBundle{}, fmt.Errorf("Relay metadata exists for %s, but its bundle payload is unavailable.", repo.DisplayName)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return downloadedRestoreBundle{}, fmt.Errorf("download bundle %s failed with status %d: %s", row.ID, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := gfgit.VerifyBundleHash(body, row.BundleHash); err != nil {
		return downloadedRestoreBundle{}, fmt.Errorf("bundle validation failed for %s: %w", row.ID, err)
	}

	var manifest gfgit.BundleManifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return downloadedRestoreBundle{}, fmt.Errorf("bundle validation failed for %s: decode manifest: %w", row.ID, err)
	}
	if repo.RootSHA != "" && manifest.RootSHA != "" && repo.RootSHA != manifest.RootSHA {
		return downloadedRestoreBundle{}, fmt.Errorf("bundle validation failed for %s: root SHA mismatch: repository %s bundle %s", row.ID, repo.RootSHA, manifest.RootSHA)
	}
	if manifest.GitBundleBase64 == "" {
		return downloadedRestoreBundle{}, fmt.Errorf("bundle validation failed for %s: relay payload does not contain restorable Git objects; run 'gitfuse sync' with a current CLI and try again", row.ID)
	}
	native, err := base64.StdEncoding.DecodeString(manifest.GitBundleBase64)
	if err != nil || len(native) == 0 {
		if err == nil {
			err = fmt.Errorf("empty native git bundle")
		}
		return downloadedRestoreBundle{}, fmt.Errorf("bundle validation failed for %s: %w", row.ID, err)
	}
	return downloadedRestoreBundle{row: row, manifest: manifest, native: native}, nil
}

func importRestoreBundles(target string, bundles []downloadedRestoreBundle) (string, string, int, error) {
	var restoredRef string
	var restoredHead string
	commitCount := 0
	tempRefs := make([]string, 0, len(bundles))
	defer func() {
		for _, tempRef := range tempRefs {
			_ = runGit(target, "update-ref", "-d", tempRef)
		}
	}()

	for i, bundle := range bundles {
		path, err := writeTempNativeBundle(bundle.native)
		if err != nil {
			return "", "", 0, err
		}
		defer os.Remove(path)

		if err := runGit(target, "bundle", "verify", path); err != nil {
			return "", "", 0, err
		}
		heads, err := listNativeBundleHeads(target, path)
		if err != nil {
			return "", "", 0, err
		}
		sourceRef, sourceHead, err := chooseRestoreBundleHead(bundle.manifest, heads)
		if err != nil {
			return "", "", 0, err
		}

		tempRef := fmt.Sprintf("refs/gitfuse/restore/%d", i)
		if err := runGit(target, "fetch", "--force", path, sourceRef+":"+tempRef); err != nil {
			return "", "", 0, err
		}
		tempRefs = append(tempRefs, tempRef)
		importedHead, err := gitOutput(target, "rev-parse", "--verify", tempRef+"^{commit}")
		if err != nil {
			return "", "", 0, err
		}
		importedHead = strings.TrimSpace(importedHead)
		if sourceHead != "" && importedHead != sourceHead {
			return "", "", 0, fmt.Errorf("bundle validation failed for %s: expected head %s actual %s", bundle.row.ID, sourceHead, importedHead)
		}
		restoredRef = sourceRef
		restoredHead = importedHead
		commitCount += len(bundle.manifest.Commits)
	}
	if restoredRef == "" || restoredHead == "" {
		return "", "", 0, fmt.Errorf("restore failed: no branch ref was found in relay bundles")
	}
	if !strings.HasPrefix(restoredRef, "refs/heads/") {
		return "", "", 0, fmt.Errorf("restore failed: restored ref %s is not a branch", restoredRef)
	}
	if err := runGit(target, "update-ref", restoredRef, restoredHead); err != nil {
		return "", "", 0, err
	}
	if err := runGit(target, "symbolic-ref", "HEAD", restoredRef); err != nil {
		return "", "", 0, err
	}
	branch := strings.TrimPrefix(restoredRef, "refs/heads/")
	if err := runGit(target, "checkout", "-f", branch); err != nil {
		return "", "", 0, err
	}
	return restoredRef, restoredHead, commitCount, nil
}

func writeTempNativeBundle(payload []byte) (string, error) {
	file, err := os.CreateTemp("", "gitfuse-restore-*.bundle")
	if err != nil {
		return "", err
	}
	path := file.Name()
	if _, err := file.Write(payload); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return "", err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func listNativeBundleHeads(target, bundlePath string) ([]bundleHead, error) {
	output, err := gitOutput(target, "bundle", "list-heads", bundlePath)
	if err != nil {
		return nil, err
	}
	var heads []bundleHead
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) == 1 {
			heads = append(heads, bundleHead{Hash: parts[0]})
			continue
		}
		heads = append(heads, bundleHead{Hash: parts[0], Ref: parts[1]})
	}
	return heads, nil
}

func chooseRestoreBundleHead(manifest gfgit.BundleManifest, heads []bundleHead) (string, string, error) {
	if manifest.HeadRef != "" {
		for _, head := range heads {
			if head.Ref == manifest.HeadRef {
				expected := manifest.HeadSHA
				if expected == "" {
					expected = head.Hash
				}
				return head.Ref, expected, nil
			}
		}
	}
	if manifest.HeadSHA != "" {
		for _, head := range heads {
			if head.Ref != "" && head.Hash == manifest.HeadSHA {
				return head.Ref, manifest.HeadSHA, nil
			}
		}
	}
	for _, head := range heads {
		if strings.HasPrefix(head.Ref, "refs/heads/") {
			expected := manifest.HeadSHA
			if expected == "" {
				expected = head.Hash
			}
			return head.Ref, expected, nil
		}
	}
	return "", "", fmt.Errorf("restore failed: bundle does not advertise a restorable branch ref")
}

func writeRestoreMetadata(target string, repo relayRepository, restoredHead string) error {
	credentials, _ := config.ReadCredentials()
	if _, err := config.WriteLocalConfig(target, config.LocalConfig{
		RootSHA:      repo.RootSHA,
		RelayEntryID: repo.RelayEntryID,
		Account:      credentials.Username,
		DisplayName:  repo.DisplayName,
		RemoteURL:    repo.RemoteURL,
		Platform:     detectPlatform(repo.RemoteURL),
	}); err != nil {
		return err
	}
	_, err := workspace.WriteLedger(target, workspace.Ledger{SyncedHead: restoredHead})
	return err
}

func validateRestoredGit(target, restoredRef string) error {
	if _, err := gitOutput(target, "rev-parse", "--verify", "HEAD"); err != nil {
		return err
	}
	if err := runGit(target, "cat-file", "-e", "HEAD^{commit}"); err != nil {
		return err
	}
	if _, err := gitOutput(target, "show-ref"); err != nil {
		return err
	}
	if restoredRef != "" {
		if err := runGit(target, "show-ref", "--verify", restoredRef); err != nil {
			return err
		}
	}
	objects, err := gitOutput(target, "rev-list", "--objects", "--all")
	if err != nil {
		return err
	}
	if strings.TrimSpace(objects) == "" {
		return fmt.Errorf("restore failed: no Git objects were imported")
	}
	if err := runGit(target, "diff", "--quiet", "HEAD", "--"); err != nil {
		return err
	}
	if err := runGit(target, "diff", "--cached", "--quiet", "HEAD", "--"); err != nil {
		return err
	}
	status, err := gitOutput(target, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return err
	}
	if strings.TrimSpace(status) != "" {
		return fmt.Errorf("restore failed: working tree does not match HEAD:\n%s", strings.TrimSpace(status))
	}
	return nil
}

func validateGitfuseUntracked(target string) error {
	tracked, err := gitOutput(target, "ls-files", "--", ".gitfuse")
	if err != nil {
		return err
	}
	if strings.TrimSpace(tracked) != "" {
		return fmt.Errorf("restore failed: .gitfuse is tracked")
	}
	staged, err := gitOutput(target, "diff", "--cached", "--name-only", "--", ".gitfuse")
	if err != nil {
		return err
	}
	if strings.TrimSpace(staged) != "" {
		return fmt.Errorf("restore failed: .gitfuse is staged")
	}
	return nil
}

func excludeGitfuseMetadata(target string) error {
	return ensureGitfuseMetadataIgnored(target)
}

type globalConfigSnapshot struct {
	registryPath   string
	registryBytes  []byte
	registryExists bool
	activePath     string
	activeBytes    []byte
	activeExists   bool
}

func captureGlobalConfigSnapshot() (globalConfigSnapshot, error) {
	var snapshot globalConfigSnapshot
	registryPath, err := config.RepositoryRegistryPath()
	if err != nil {
		return snapshot, err
	}
	activePath, err := config.ActiveRepoPath()
	if err != nil {
		return snapshot, err
	}
	snapshot.registryPath = registryPath
	snapshot.activePath = activePath
	if content, err := os.ReadFile(registryPath); err == nil {
		snapshot.registryExists = true
		snapshot.registryBytes = content
	} else if !os.IsNotExist(err) {
		return snapshot, err
	}
	if content, err := os.ReadFile(activePath); err == nil {
		snapshot.activeExists = true
		snapshot.activeBytes = content
	} else if !os.IsNotExist(err) {
		return snapshot, err
	}
	return snapshot, nil
}

func (snapshot globalConfigSnapshot) restore() {
	restoreSnapshotFile(snapshot.registryPath, snapshot.registryBytes, snapshot.registryExists)
	restoreSnapshotFile(snapshot.activePath, snapshot.activeBytes, snapshot.activeExists)
}

func restoreSnapshotFile(path string, content []byte, exists bool) {
	if path == "" {
		return
	}
	if !exists {
		_ = os.Remove(path)
		return
	}
	_ = os.WriteFile(path, content, 0o600)
}

func registerRestoredRepository(target string, repo relayRepository) error {
	snapshot, err := captureGlobalConfigSnapshot()
	if err != nil {
		return err
	}
	canonical, err := canonicalPath(target)
	if err != nil {
		return err
	}
	credentials, _ := config.ReadCredentials()
	if _, err := config.UpsertRepositoryRegistryEntry(config.RegistryEntry{
		Name:         repo.DisplayName,
		Path:         canonical,
		RootSHA:      repo.RootSHA,
		RelayEntryID: repo.RelayEntryID,
		RemoteURL:    repo.RemoteURL,
		DeviceID:     credentials.DeviceID,
	}); err != nil {
		snapshot.restore()
		return fmt.Errorf("write global repository registry: %w", err)
	}
	if _, err := config.WriteActiveRepo(config.ActiveRepo{Name: repo.DisplayName, Path: canonical}); err != nil {
		snapshot.restore()
		return fmt.Errorf("write active repository: %w", err)
	}
	if err := validateRestoredRegistration(target, repo); err != nil {
		snapshot.restore()
		return err
	}
	return nil
}

func validateRestoredRegistration(target string, repo relayRepository) error {
	canonical, err := canonicalPath(target)
	if err != nil {
		return err
	}
	registry, err := config.ReadRepositoryRegistry()
	if err != nil {
		return err
	}
	for _, entry := range registry.Entries {
		if entry.RelayEntryID == repo.RelayEntryID && entry.Path == canonical {
			return nil
		}
	}
	return fmt.Errorf("restore failed: restored repository was not registered in the local GitFuse cache")
}

func runGit(repoPath string, args ...string) error {
	_, err := gitOutput(repoPath, args...)
	return err
}

func gitOutput(repoPath string, args ...string) (string, error) {
	fullArgs := append([]string{"-C", repoPath}, args...)
	cmd := exec.Command("git", fullArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if detail == "" {
			detail = err.Error()
		}
		return "", fmt.Errorf("git %s failed: %s", strings.Join(args, " "), detail)
	}
	return string(output), nil
}
