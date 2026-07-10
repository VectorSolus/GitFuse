package cmd

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

type pullOptions struct {
	asBranch string
	force    bool
}

var pullOpts pullOptions

var pullCmd = &cobra.Command{
	Use:   "pull",
	Short: "Download and transactionally replay relay bundles",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runPull(cmd, pullOpts)
	},
}

func init() {
	pullCmd.Flags().StringVar(&pullOpts.asBranch, "as-branch", "", "replay incoming bundles onto a new branch")
	pullCmd.Flags().BoolVar(&pullOpts.force, "force", false, "force replay after creating .gitfuse/backup/")
	rootCmd.AddCommand(pullCmd)
}

func runPull(cmd *cobra.Command, opts pullOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := ensurePullHasHead(repoPath); err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
		return err
	}
	localCfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/config: %w", err)
	}
	if localCfg.RelayEntryID == "" {
		return fmt.Errorf("read .gitfuse/config: relay_entry_id is required")
	}
	rootSHA, err := gfgit.RootSHA(repoPath)
	if err != nil {
		return err
	}
	if err := gfgit.ValidateLayerOneRoot(rootSHA, localCfg.RootSHA); err != nil {
		return err
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	ledger, _, err = repairLedgerSyncedHeadIfNeeded(repoPath, ledger)
	if err != nil {
		return err
	}
	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	applyRewrite, err := confirmHistoryRewriteIfNeeded(cmd, repoPath)
	if err != nil {
		return err
	}
	if !applyRewrite {
		fmt.Fprintln(cmd.OutOrStdout(), "Pull cancelled. Rewritten history not applied.")
		return nil
	}
	if opts.force {
		if err := requireTypedYes(cmd); err != nil {
			return err
		}
		if err := createPullBackup(repoPath); err != nil {
			return err
		}
	}
	ctx := cmd.Context()
	if ctx == nil {
		ctx = context.Background()
	}
	result, err := pullRelayBundles(ctx, repoPath, localCfg, ledger, head, opts.asBranch == "")
	if err != nil {
		return err
	}
	commitCount := result.PulledCommits
	if progress := tui.ReplayProgress(commitCount); progress != "" {
		fmt.Fprintln(cmd.OutOrStdout(), progress)
	}
	if opts.asBranch != "" {
		target := result.RemoteHead
		if target == "" {
			target = "HEAD"
		}
		if err := gfgit.CreateTempReplayBranch(repoPath, opts.asBranch); err != nil {
			return err
		}
		if target != "HEAD" {
			if err := runGit(repoPath, "branch", "-f", opts.asBranch, target); err != nil {
				return err
			}
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Replayed bundles as branch %s.\n", opts.asBranch)
		return nil
	}
	switch {
	case result.PulledCommits == 0:
		fmt.Fprintln(cmd.OutOrStdout(), "No new commits to pull.")
	case result.FastForwarded:
		fmt.Fprintf(cmd.OutOrStdout(), "Pulled %d commit(s), fast-forwarded branch.\n", result.PulledCommits)
	default:
		fmt.Fprintf(cmd.OutOrStdout(), "Pulled %d commit(s), branch unchanged because non-fast-forward.\n", result.PulledCommits)
	}
	return nil
}

type pullResult struct {
	PulledCommits int
	RemoteHead    string
	FastForwarded bool
}

type relayHeadCandidate struct {
	Head      string
	DeviceID  string
	BundleID  string
	CreatedAt string
}

func pullRelayBundles(ctx context.Context, repoPath string, localCfg config.LocalConfig, ledger workspace.Ledger, localHead string, allowFastForward bool) (pullResult, error) {
	rows, err := loadRestoreBundleRows(ctx, localCfg.RelayEntryID)
	if err != nil {
		return pullResult{}, err
	}
	rows, err = selectPullBundleRows(localCfg.DisplayName, rows)
	if err != nil {
		return pullResult{}, err
	}
	if len(rows) == 0 {
		return pullResult{}, nil
	}

	repo := relayRepository{
		RootSHA:      localCfg.RootSHA,
		DisplayName:  localCfg.DisplayName,
		RelayEntryID: localCfg.RelayEntryID,
	}
	metadataHead, metadataHeadOK := remoteHeadFromRows(rows)
	if metadataHeadOK {
		remoteReachable, err := commitReachableFrom(repoPath, metadataHead, localHead)
		if err != nil {
			return pullResult{}, err
		}
		if remoteReachable {
			if _, _, err := advanceLedgerToReachableRelayHeadIfNeeded(repoPath, ledger, localHead, metadataHead); err != nil {
				return pullResult{}, err
			}
			return pullResult{RemoteHead: metadataHead}, nil
		}
	} else if ledger.SyncedHead == localHead {
		return pullResult{RemoteHead: localHead}, nil
	} else {
		repaired, ok, err := repairLedgerToLocalHeadForLegacyRelayRowsIfSafe(repoPath, ledger, localHead, rows, nil)
		if err != nil {
			return pullResult{}, err
		}
		if ok || repaired.SyncedHead == localHead {
			return pullResult{RemoteHead: localHead}, nil
		}
		ledger = repaired
	}
	if allowFastForward {
		if err := ensureCleanTrackedWorktree(repoPath); err != nil {
			return pullResult{}, err
		}
	}

	downloadRows := rows
	if metadataHeadOK {
		downloadRows, err = selectRequiredPullBundleRows(repoPath, rows, localHead)
		if err != nil {
			return pullResult{}, err
		}
	}

	bundles := make([]downloadedRestoreBundle, 0, len(downloadRows))
	for _, row := range downloadRows {
		bundle, err := downloadRestoreBundle(ctx, repo, row)
		if err != nil {
			return pullResult{}, err
		}
		bundles = append(bundles, bundle)
	}

	remoteHead, err := remoteHeadFromBundles(bundles)
	if err != nil {
		return pullResult{}, err
	}
	if metadataHeadOK && metadataHead != remoteHead {
		return pullResult{}, fmt.Errorf("pull failed: relay metadata head %s does not match downloaded bundle head %s", metadataHead, remoteHead)
	}
	remoteReachable, err := commitReachableFrom(repoPath, remoteHead, localHead)
	if err != nil {
		return pullResult{}, err
	}
	if remoteReachable {
		if _, _, err := advanceLedgerToReachableRelayHeadIfNeeded(repoPath, ledger, localHead, remoteHead); err != nil {
			return pullResult{}, err
		}
		return pullResult{RemoteHead: remoteHead}, nil
	}

	importedHead, importedCount, err := importMissingPullBundles(repoPath, bundles, ledger)
	if err != nil {
		return pullResult{}, err
	}
	if importedHead != "" && importedHead != remoteHead {
		return pullResult{}, fmt.Errorf("pull failed: expected remote head %s but imported %s", remoteHead, importedHead)
	}
	if ok, err := commitExists(repoPath, remoteHead); err != nil {
		return pullResult{}, err
	} else if !ok {
		return pullResult{}, fmt.Errorf("pull failed: relay reported new commits but no remote head was imported")
	}
	if err := verifyCommitObject(repoPath, remoteHead); err != nil {
		return pullResult{}, err
	}

	pulledCount, err := commitCountBetween(repoPath, localHead, remoteHead)
	if err != nil {
		return pullResult{}, err
	}
	if pulledCount == 0 {
		pulledCount = importedCount
	}
	result := pullResult{PulledCommits: pulledCount, RemoteHead: remoteHead}
	if isAncestor, err := isAncestor(repoPath, localHead, remoteHead); err != nil {
		return pullResult{}, err
	} else if allowFastForward && isAncestor {
		if err := runGit(repoPath, "merge", "--ff-only", remoteHead); err != nil {
			return pullResult{}, err
		}
		result.FastForwarded = true
	}

	if result.FastForwarded {
		if err := updatePullLedger(repoPath, ledger, remoteHead); err != nil {
			return pullResult{}, err
		}
	}
	return result, nil
}

func selectPullBundleRows(repoName string, rows []relayBundleRow) ([]relayBundleRow, error) {
	now := time.Now()
	active := make([]relayBundleRow, 0, len(rows))
	for _, row := range rows {
		status := strings.ToLower(strings.TrimSpace(row.Status))
		if status != "" && status != "active" {
			continue
		}
		if row.ExpiresAt != "" {
			expiresAt, err := time.Parse(time.RFC3339, row.ExpiresAt)
			if err != nil {
				return nil, fmt.Errorf("bundle metadata for %s has invalid expiresAt %q", repoName, row.ExpiresAt)
			}
			if !expiresAt.After(now) {
				continue
			}
		}
		active = append(active, row)
	}
	sortPullBundleRows(active)
	return active, nil
}

func sortPullBundleRows(rows []relayBundleRow) {
	sort.Slice(rows, func(i, j int) bool {
		left, leftErr := time.Parse(time.RFC3339, rows[i].CreatedAt)
		right, rightErr := time.Parse(time.RFC3339, rows[j].CreatedAt)
		if leftErr != nil || rightErr != nil {
			return rows[i].ID < rows[j].ID
		}
		return left.Before(right)
	})
}

func selectRequiredPullBundleRows(repoPath string, rows []relayBundleRow, localHead string) ([]relayBundleRow, error) {
	required := make([]relayBundleRow, 0, len(rows))
	for _, row := range rows {
		head := relayHeadFromBundleRow(row)
		if head == "" {
			continue
		}
		reachable, err := commitReachableFrom(repoPath, head, localHead)
		if err != nil {
			return nil, err
		}
		if reachable {
			continue
		}
		required = append(required, row)
	}
	if len(required) == 0 {
		return nil, fmt.Errorf("pull failed: relay metadata advertises a new head but no required bundle payload was identified")
	}
	return required, nil
}

func importMissingPullBundles(repoPath string, bundles []downloadedRestoreBundle, ledger workspace.Ledger) (string, int, error) {
	disposed := make(map[string]bool, len(ledger.DisposedCommits))
	for _, sha := range ledger.DisposedCommits {
		disposed[sha] = true
	}

	importedCount := 0
	importedHead := ""
	tempRefs := make([]string, 0, len(bundles))
	defer func() {
		for _, tempRef := range tempRefs {
			_ = runGit(repoPath, "update-ref", "-d", tempRef)
		}
	}()

	for i, bundle := range bundles {
		missing, err := missingManifestCommits(repoPath, bundle.manifest, disposed)
		if err != nil {
			return "", 0, err
		}
		if len(missing) == 0 {
			continue
		}

		path, err := writeTempNativeBundle(bundle.native)
		if err != nil {
			return "", 0, err
		}
		defer os.Remove(path)

		if err := runGit(repoPath, "bundle", "verify", path); err != nil {
			return "", 0, err
		}
		heads, err := listNativeBundleHeads(repoPath, path)
		if err != nil {
			return "", 0, err
		}
		sourceRef, sourceHead, err := chooseRestoreBundleHead(bundle.manifest, heads)
		if err != nil {
			return "", 0, err
		}

		tempRef := fmt.Sprintf("refs/gitfuse/pull/%d", i)
		if err := runGit(repoPath, "fetch", "--force", path, sourceRef+":"+tempRef); err != nil {
			return "", 0, err
		}
		tempRefs = append(tempRefs, tempRef)
		importedRefHead, err := gitOutput(repoPath, "rev-parse", "--verify", tempRef+"^{commit}")
		if err != nil {
			return "", 0, err
		}
		importedRefHead = strings.TrimSpace(importedRefHead)
		if sourceHead != "" && importedRefHead != sourceHead {
			return "", 0, fmt.Errorf("bundle validation failed for %s: expected head %s actual %s", bundle.row.ID, sourceHead, importedRefHead)
		}
		for _, sha := range missing {
			if err := verifyCommitObject(repoPath, sha); err != nil {
				return "", 0, err
			}
		}
		importedCount += len(missing)
		importedHead = importedRefHead
	}
	return importedHead, importedCount, nil
}

func remoteHeadFromBundles(bundles []downloadedRestoreBundle) (string, error) {
	for i := len(bundles) - 1; i >= 0; i-- {
		manifest := bundles[i].manifest
		if manifest.HeadSHA != "" {
			return manifest.HeadSHA, nil
		}
		if len(manifest.Commits) > 0 {
			return manifest.Commits[len(manifest.Commits)-1].SHA, nil
		}
	}
	return "", fmt.Errorf("pull failed: relay bundles do not advertise a remote head")
}

func remoteHeadFromRows(rows []relayBundleRow) (string, bool) {
	for i := len(rows) - 1; i >= 0; i-- {
		if head := relayHeadFromBundleRow(rows[i]); head != "" {
			return head, true
		}
	}
	return "", false
}

func relayHeadFromBundleRow(row relayBundleRow) string {
	for _, head := range []string{row.HeadSHA, row.HeadSHAUpper, row.HeadSHASnake} {
		if head = strings.TrimSpace(head); head != "" {
			return head
		}
	}
	for i := len(row.Commits) - 1; i >= 0; i-- {
		if sha := strings.TrimSpace(row.Commits[i].SHA); sha != "" {
			return sha
		}
	}
	return ""
}

func missingManifestCommits(repoPath string, manifest gfgit.BundleManifest, disposed map[string]bool) ([]string, error) {
	missing := make([]string, 0, len(manifest.Commits))
	for _, commit := range manifest.Commits {
		if commit.SHA == "" || disposed[commit.SHA] {
			continue
		}
		present, err := commitExists(repoPath, commit.SHA)
		if err != nil {
			return nil, err
		}
		if !present {
			missing = append(missing, commit.SHA)
		}
	}
	return missing, nil
}

func commitExists(repoPath, sha string) (bool, error) {
	_, err := gitOutput(repoPath, "cat-file", "-e", sha+"^{commit}")
	if err == nil {
		return true, nil
	}
	if strings.Contains(err.Error(), "Not a valid object name") ||
		strings.Contains(err.Error(), "Not a valid object") ||
		strings.Contains(err.Error(), "could not get object info") {
		return false, nil
	}
	return false, err
}

func commitReachableFrom(repoPath, commit, head string) (bool, error) {
	if commit == "" || head == "" {
		return false, nil
	}
	present, err := commitExists(repoPath, commit)
	if err != nil {
		return false, err
	}
	if !present {
		return false, nil
	}
	return isAncestor(repoPath, commit, head)
}

func commitCountBetween(repoPath, from, to string) (int, error) {
	if from == "" || to == "" {
		return 0, nil
	}
	out, err := gitOutput(repoPath, "rev-list", "--count", from+".."+to)
	if err != nil {
		return 0, err
	}
	count := 0
	if _, err := fmt.Sscanf(strings.TrimSpace(out), "%d", &count); err != nil {
		return 0, fmt.Errorf("parse pulled commit count: %w", err)
	}
	return count, nil
}

func verifyCommitObject(repoPath, sha string) error {
	if ok, err := commitExists(repoPath, sha); err != nil {
		return err
	} else if !ok {
		return fmt.Errorf("pull failed: expected commit %s was not imported", sha)
	}
	return nil
}

func isAncestor(repoPath, ancestor, descendant string) (bool, error) {
	if ancestor == "" || descendant == "" {
		return false, nil
	}
	_, err := gitOutput(repoPath, "merge-base", "--is-ancestor", ancestor, descendant)
	if err == nil {
		return true, nil
	}
	if strings.Contains(err.Error(), "exit status 1") {
		return false, nil
	}
	return false, err
}

func ensureCleanTrackedWorktree(repoPath string) error {
	if err := runGit(repoPath, "diff", "--quiet", "HEAD", "--"); err != nil {
		return fmt.Errorf("working tree has local changes; commit or stash them before pulling")
	}
	if err := runGit(repoPath, "diff", "--cached", "--quiet", "HEAD", "--"); err != nil {
		return fmt.Errorf("index has staged changes; commit or unstage them before pulling")
	}
	return nil
}

func trackedWorktreeClean(repoPath string) (bool, error) {
	if err := runGit(repoPath, "diff", "--quiet", "HEAD", "--"); err != nil {
		if strings.Contains(err.Error(), "exit status 1") {
			return false, nil
		}
		return false, err
	}
	if err := runGit(repoPath, "diff", "--cached", "--quiet", "HEAD", "--"); err != nil {
		if strings.Contains(err.Error(), "exit status 1") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func updatePullLedger(repoPath string, ledger workspace.Ledger, syncedHead string) error {
	ledger.PreviousSyncedHead = ledger.SyncedHead
	ledger.SyncedHead = syncedHead
	ledger.LastPullAt = time.Now().UTC().Format(time.RFC3339)
	_, err := workspace.WriteLedger(repoPath, ledger)
	return err
}

func repairLedgerSyncedHeadIfNeeded(repoPath string, ledger workspace.Ledger) (workspace.Ledger, bool, error) {
	if ledger.SyncedHead == "" || ledger.PreviousSyncedHead == "" {
		return ledger, false, nil
	}
	head, err := currentHead(repoPath)
	if err != nil {
		return ledger, false, err
	}
	currentReachable, err := commitReachableFrom(repoPath, ledger.SyncedHead, head)
	if err != nil {
		return ledger, false, err
	}
	if currentReachable {
		return ledger, false, nil
	}
	previousReachable, err := commitReachableFrom(repoPath, ledger.PreviousSyncedHead, head)
	if err != nil {
		return ledger, false, err
	}
	if !previousReachable {
		return ledger, false, nil
	}
	ledger.SyncedHead = ledger.PreviousSyncedHead
	ledger.PreviousSyncedHead = ""
	_, err = workspace.WriteLedger(repoPath, ledger)
	return ledger, err == nil, err
}

func advanceLedgerToReachableRelayHeadIfNeeded(repoPath string, ledger workspace.Ledger, localHead, relayHead string) (workspace.Ledger, bool, error) {
	relayHead = strings.TrimSpace(relayHead)
	if relayHead == "" || ledger.SyncedHead == relayHead {
		return ledger, false, nil
	}
	relayReachable, err := commitReachableFrom(repoPath, relayHead, localHead)
	if err != nil {
		return ledger, false, err
	}
	if !relayReachable {
		return ledger, false, nil
	}
	if ledger.SyncedHead != "" {
		ledgerReachableFromRelay, err := commitReachableFrom(repoPath, ledger.SyncedHead, relayHead)
		if err != nil {
			return ledger, false, err
		}
		if !ledgerReachableFromRelay {
			return ledger, false, nil
		}
	}
	ledger.PreviousSyncedHead = ledger.SyncedHead
	ledger.SyncedHead = relayHead
	_, err = workspace.WriteLedger(repoPath, ledger)
	return ledger, err == nil, err
}

func repairLedgerToLocalHeadForLegacyRelayRowsIfSafe(repoPath string, ledger workspace.Ledger, localHead string, rows []relayBundleRow, candidates []relayHeadCandidate) (workspace.Ledger, bool, error) {
	if len(rows) == 0 || len(candidates) > 0 || ledger.SyncedHead == "" || localHead == "" || ledger.SyncedHead == localHead {
		return ledger, false, nil
	}
	if _, ok := remoteHeadFromRows(rows); ok {
		return ledger, false, nil
	}
	ledgerReachable, err := commitReachableFrom(repoPath, ledger.SyncedHead, localHead)
	if err != nil || !ledgerReachable {
		return ledger, false, err
	}
	clean, err := trackedWorktreeClean(repoPath)
	if err != nil || !clean {
		return ledger, false, err
	}
	lastPullAt, ok := parseLedgerTimestamp(ledger.LastPullAt)
	if !ok {
		return ledger, false, nil
	}
	notNewer, err := commitsBetweenNotNewerThan(repoPath, ledger.SyncedHead, localHead, lastPullAt)
	if err != nil || !notNewer {
		return ledger, false, err
	}
	ledger.PreviousSyncedHead = ledger.SyncedHead
	ledger.SyncedHead = localHead
	_, err = workspace.WriteLedger(repoPath, ledger)
	return ledger, err == nil, err
}

func parseLedgerTimestamp(value string) (time.Time, bool) {
	if strings.TrimSpace(value) == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, value)
	return parsed, err == nil
}

func commitsBetweenNotNewerThan(repoPath, from, to string, cutoff time.Time) (bool, error) {
	if from == "" || to == "" || from == to {
		return true, nil
	}
	out, err := gitOutput(repoPath, "log", "--format=%ct", from+".."+to)
	if err != nil {
		return false, err
	}
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		seconds, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			return false, fmt.Errorf("parse commit timestamp %q: %w", line, err)
		}
		if time.Unix(seconds, 0).After(cutoff) {
			return false, nil
		}
	}
	return true, nil
}

func latestRelayHead(ctx context.Context, localCfg config.LocalConfig) (string, bool, error) {
	heads, err := activeRelayHeads(ctx, localCfg)
	if err != nil {
		return "", false, err
	}
	if len(heads) == 0 {
		return "", false, nil
	}
	return heads[len(heads)-1], true, nil
}

func activeRelayHeads(ctx context.Context, localCfg config.LocalConfig) ([]string, error) {
	candidates, err := activeRelayHeadCandidates(ctx, localCfg)
	if err != nil {
		return nil, err
	}
	heads := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		heads = append(heads, candidate.Head)
	}
	return heads, nil
}

func activeRelayMetadata(ctx context.Context, localCfg config.LocalConfig) ([]relayBundleRow, []relayHeadCandidate, error) {
	rows, err := activeRelayBundleRows(ctx, localCfg)
	if err != nil {
		return nil, nil, err
	}
	return rows, relayHeadCandidatesFromRows(rows), nil
}

func activeRelayBundleRows(ctx context.Context, localCfg config.LocalConfig) ([]relayBundleRow, error) {
	if localCfg.RelayEntryID == "" {
		return nil, nil
	}
	rows, err := loadRestoreBundleRows(ctx, localCfg.RelayEntryID)
	if err != nil {
		return nil, err
	}
	return selectPullBundleRows(localCfg.DisplayName, rows)
}

func activeRelayHeadCandidates(ctx context.Context, localCfg config.LocalConfig) ([]relayHeadCandidate, error) {
	rows, err := activeRelayBundleRows(ctx, localCfg)
	if err != nil {
		return nil, err
	}
	return relayHeadCandidatesFromRows(rows), nil
}

func relayHeadCandidatesFromRows(rows []relayBundleRow) []relayHeadCandidate {
	candidates := make([]relayHeadCandidate, 0, len(rows))
	for _, row := range rows {
		head := relayHeadFromBundleRow(row)
		if head == "" {
			continue
		}
		candidates = append(candidates, relayHeadCandidate{
			Head:      head,
			DeviceID:  strings.TrimSpace(row.DeviceID),
			BundleID:  row.ID,
			CreatedAt: row.CreatedAt,
		})
	}
	return candidates
}

func repairLedgerForRelayHeadIfNeeded(repoPath string, ledger workspace.Ledger, localHead, relayHead string) (workspace.Ledger, bool, error) {
	if relayHead == "" || ledger.PreviousSyncedHead == "" {
		return ledger, false, nil
	}
	relayReachable, err := commitReachableFrom(repoPath, relayHead, localHead)
	if err != nil {
		return ledger, false, err
	}
	if relayReachable {
		return ledger, false, nil
	}
	currentReachable, err := commitReachableFrom(repoPath, ledger.SyncedHead, localHead)
	if err != nil {
		return ledger, false, err
	}
	if currentReachable && ledger.SyncedHead != localHead {
		return ledger, false, nil
	}
	previousReachable, err := commitReachableFrom(repoPath, ledger.PreviousSyncedHead, localHead)
	if err != nil {
		return ledger, false, err
	}
	if !previousReachable {
		return ledger, false, nil
	}
	ledger.SyncedHead = ledger.PreviousSyncedHead
	ledger.PreviousSyncedHead = ""
	_, err = workspace.WriteLedger(repoPath, ledger)
	return ledger, err == nil, err
}

func firstUnreachableRelayHead(repoPath, localHead string, relayHeads []string) (string, bool, error) {
	for _, relayHead := range relayHeads {
		reachable, err := commitReachableFrom(repoPath, relayHead, localHead)
		if err != nil {
			return "", false, err
		}
		if !reachable {
			return relayHead, true, nil
		}
	}
	return "", false, nil
}

func blockingRelayHeadCandidates(repoPath, localHead string, candidates []relayHeadCandidate, localDeviceID string) ([]relayHeadCandidate, error) {
	blockers := make([]relayHeadCandidate, 0)
	localDeviceID = strings.TrimSpace(localDeviceID)
	for index, candidate := range candidates {
		reachable, err := commitReachableFrom(repoPath, candidate.Head, localHead)
		if err != nil {
			return nil, err
		}
		if reachable {
			continue
		}
		if localDeviceID != "" && strings.TrimSpace(candidate.DeviceID) == localDeviceID {
			continue
		}
		superseded, err := hasLaterReachableHeadFromSameDevice(repoPath, localHead, candidates, index)
		if err != nil {
			return nil, err
		}
		if superseded {
			continue
		}
		blockers = append(blockers, candidate)
	}
	return blockers, nil
}

func hasLaterReachableHeadFromSameDevice(repoPath, localHead string, candidates []relayHeadCandidate, index int) (bool, error) {
	deviceID := strings.TrimSpace(candidates[index].DeviceID)
	if deviceID == "" {
		return false, nil
	}
	for i := index + 1; i < len(candidates); i++ {
		if strings.TrimSpace(candidates[i].DeviceID) != deviceID {
			continue
		}
		reachable, err := commitReachableFrom(repoPath, candidates[i].Head, localHead)
		if err != nil {
			return false, err
		}
		if reachable {
			return true, nil
		}
	}
	return false, nil
}

func repairLedgerForUnreachableRelayHeadsIfNeeded(repoPath string, ledger workspace.Ledger, localHead string, relayHeads []string) (workspace.Ledger, bool, error) {
	relayHead, ok, err := firstUnreachableRelayHead(repoPath, localHead, relayHeads)
	if err != nil || !ok {
		return ledger, false, err
	}
	return repairLedgerForRelayHeadIfNeeded(repoPath, ledger, localHead, relayHead)
}

func repairLedgerForBlockingRelayHeadsIfNeeded(repoPath string, ledger workspace.Ledger, localHead string, blockers []relayHeadCandidate) (workspace.Ledger, bool, error) {
	if len(blockers) == 0 {
		return ledger, false, nil
	}
	return repairLedgerForRelayHeadIfNeeded(repoPath, ledger, localHead, blockers[0].Head)
}

func bestReachableRelaySyncBase(repoPath, localHead string, candidates []relayHeadCandidate) (string, bool, error) {
	bestHead := ""
	bestDistance := 0
	for _, candidate := range candidates {
		reachable, err := commitReachableFrom(repoPath, candidate.Head, localHead)
		if err != nil {
			return "", false, err
		}
		if !reachable {
			continue
		}
		distance, err := commitCountBetween(repoPath, candidate.Head, localHead)
		if err != nil {
			return "", false, err
		}
		if bestHead == "" || distance < bestDistance {
			bestHead = candidate.Head
			bestDistance = distance
		}
	}
	return bestHead, bestHead != "", nil
}

func effectiveRelaySyncBase(repoPath string, ledger workspace.Ledger, localHead string, candidates []relayHeadCandidate) (string, error) {
	relayBase, ok, err := bestReachableRelaySyncBase(repoPath, localHead, candidates)
	if err != nil || !ok {
		return ledger.SyncedHead, err
	}
	if ledger.SyncedHead == "" || ledger.SyncedHead == relayBase {
		return relayBase, nil
	}
	ledgerReachable, err := commitReachableFrom(repoPath, ledger.SyncedHead, localHead)
	if err != nil {
		return "", err
	}
	if !ledgerReachable {
		return relayBase, nil
	}
	relayIncludesLedger, err := commitReachableFrom(repoPath, ledger.SyncedHead, relayBase)
	if err != nil {
		return "", err
	}
	if relayIncludesLedger {
		return relayBase, nil
	}
	return ledger.SyncedHead, nil
}

func localDeviceID() string {
	if credentials, err := config.ReadCredentials(); err == nil {
		if deviceID := strings.TrimSpace(credentials.DeviceID); deviceID != "" {
			return deviceID
		}
	}
	if deviceID, err := config.ReadDeviceID(); err == nil {
		return strings.TrimSpace(deviceID)
	}
	return ""
}

func ensurePullHasHead(repoPath string) error {
	if _, err := gitOutput(repoPath, "rev-parse", "--verify", "HEAD^{commit}"); err != nil {
		return fmt.Errorf("local repository is empty; use 'gitfuse restore <relay-entry-name>' to restore from relay bundles")
	}
	return nil
}

func createPullBackup(repoPath string) error {
	path := filepath.Join(repoPath, ".gitfuse", "backup", time.Now().UTC().Format("20060102T150405Z"))
	return os.MkdirAll(path, 0o700)
}

func requireTypedYes(cmd *cobra.Command) error {
	fmt.Fprintln(cmd.OutOrStdout(), "Type yes to continue with forced pull:")
	reader := bufio.NewReader(cmd.InOrStdin())
	line, err := reader.ReadString('\n')
	if err != nil {
		return err
	}
	if strings.TrimSpace(line) != "yes" {
		return fmt.Errorf("forced pull cancelled")
	}
	return nil
}

func pullCommitCount() int {
	raw := os.Getenv("GITFUSE_PULL_COMMIT_COUNT")
	if raw == "" {
		return 0
	}
	var count int
	_, _ = fmt.Sscanf(raw, "%d", &count)
	return count
}

func confirmHistoryRewriteIfNeeded(cmd *cobra.Command, repoPath string) (bool, error) {
	if os.Getenv("GITFUSE_HISTORY_REWRITTEN") != "1" {
		if _, err := os.Stat(filepath.Join(repoPath, ".gitfuse", "history-rewrite")); err != nil {
			return true, nil
		}
	}
	fmt.Fprint(cmd.OutOrStdout(), "History was rewritten. Apply? [Y/n] ")
	reader := bufio.NewReader(cmd.InOrStdin())
	line, err := reader.ReadString('\n')
	if err != nil && strings.TrimSpace(line) == "" {
		return false, err
	}
	answer := strings.ToLower(strings.TrimSpace(line))
	return answer == "" || answer == "y" || answer == "yes", nil
}
