package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

var rebaseSyncCmd = &cobra.Command{
	Use:   "rebase-sync",
	Short: "Upload rewritten history as a superseding relay bundle",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRebaseSync(cmd.Context(), cmd)
	},
}

func init() {
	rootCmd.AddCommand(rebaseSyncCmd)
}

func runRebaseSync(ctx context.Context, cmd *cobra.Command) error {
	if ctx == nil {
		ctx = context.Background()
	}
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
		return err
	}
	if err := ensureCleanWorktree(repoPath); err != nil {
		return err
	}
	localCfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/config: %w", err)
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
	if ledger.SyncedHead == "" {
		return fmt.Errorf("no previous synced head recorded; run 'gitfuse sync' first")
	}
	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	relayHead := ""
	hasRelayHead := false
	if canHydrateRelayHeadForRebaseSync(localCfg) {
		relayHead, hasRelayHead, err = hydrateRelayHeadForRebaseSync(ctx, repoPath, localCfg, ledger, head)
		if err != nil {
			return fmt.Errorf("hydrate relay head before rebase-sync: %w", err)
		}
	}
	contains, err := historyContains(repoPath, ledger.SyncedHead)
	if err != nil {
		return err
	}
	if !contains {
		return uploadSupersedingHistory(ctx, cmd, repoPath, localCfg, ledger.SyncedHead)
	}
	if hasRelayHead {
		return rebaseAndSyncAgainstRelayHead(ctx, cmd, repoPath, localCfg, head, relayHead)
	}

	if contains {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	return nil
}

func canHydrateRelayHeadForRebaseSync(localCfg config.LocalConfig) bool {
	if strings.TrimSpace(localCfg.RelayEntryID) == "" || strings.TrimSpace(deviceToken()) == "" {
		return false
	}
	_, err := relayBaseURLOrError()
	return err == nil
}

func hydrateRelayHeadForRebaseSync(ctx context.Context, repoPath string, localCfg config.LocalConfig, ledger workspace.Ledger, localHead string) (string, bool, error) {
	rows, err := activeRelayBundleRows(ctx, localCfg)
	if err != nil {
		return "", false, err
	}
	if len(rows) == 0 {
		return "", false, nil
	}

	repo := relayRepository{
		RootSHA:      localCfg.RootSHA,
		DisplayName:  localCfg.DisplayName,
		RelayEntryID: localCfg.RelayEntryID,
	}
	downloadRows := make([]relayBundleRow, 0, len(rows))
	for _, row := range rows {
		head := relayHeadFromBundleRow(row)
		if head == "" {
			continue
		}
		reachable, err := commitReachableFrom(repoPath, head, localHead)
		if err != nil {
			return "", false, err
		}
		if !reachable {
			downloadRows = append(downloadRows, row)
		}
	}

	if len(downloadRows) > 0 {
		bundles := make([]downloadedRestoreBundle, 0, len(downloadRows))
		for _, row := range downloadRows {
			bundle, err := downloadRestoreBundle(ctx, repo, row)
			if err != nil {
				return "", false, err
			}
			bundles = append(bundles, bundle)
		}
		if _, _, err := importMissingPullBundles(repoPath, bundles, ledger); err != nil {
			return "", false, err
		}
	}

	candidates := relayHeadCandidatesFromRows(rows)
	for i := len(candidates) - 1; i >= 0; i-- {
		reachable, err := commitReachableFrom(repoPath, candidates[i].Head, localHead)
		if err != nil {
			return "", false, err
		}
		if reachable {
			continue
		}
		if ok, err := commitExists(repoPath, candidates[i].Head); err != nil {
			return "", false, err
		} else if !ok {
			return "", false, fmt.Errorf("relay head %s was not imported", candidates[i].Head)
		}
		return candidates[i].Head, true, nil
	}
	if len(candidates) == 0 {
		return "", false, nil
	}
	return candidates[len(candidates)-1].Head, true, nil
}

func rebaseAndSyncAgainstRelayHead(ctx context.Context, cmd *cobra.Command, repoPath string, localCfg config.LocalConfig, localHead, relayHead string) error {
	if relayHead == "" || relayHead == localHead {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	relayContainsLocal, err := commitReachableFrom(repoPath, localHead, relayHead)
	if err != nil {
		return err
	}
	if relayContainsLocal {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	localContainsRelay, err := commitReachableFrom(repoPath, relayHead, localHead)
	if err != nil {
		return err
	}
	if localContainsRelay {
		return syncRebaseSyncCommits(ctx, cmd, repoPath, localCfg.RelayEntryID, relayHead)
	}

	mergeBase, err := mergeBase(repoPath, relayHead, localHead)
	if err != nil {
		return err
	}
	localCommits, err := commitCountBetween(repoPath, mergeBase, localHead)
	if err != nil {
		return err
	}
	if localCommits == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	if err := runGit(repoPath, "rebase", "--onto", relayHead, mergeBase); err != nil {
		_ = runGit(repoPath, "rebase", "--abort")
		return fmt.Errorf("rebase local commits onto relay head: %w", err)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Rebased %d commit(s) onto relay head.\n", localCommits)
	return syncRebaseSyncCommits(ctx, cmd, repoPath, localCfg.RelayEntryID, relayHead)
}

func syncRebaseSyncCommits(ctx context.Context, cmd *cobra.Command, repoPath, relayEntryID, syncedHead string) error {
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, syncedHead)
	if err != nil {
		return err
	}
	if len(bundle.Manifest.Commits) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	if err := uploadOrStoreRebaseSyncBundle(ctx, repoPath, relayEntryID, bundle); err != nil {
		return err
	}
	if err := workspace.UpdateSyncedHead(repoPath, bundle.Manifest.HeadSHA); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Synced %d commit(s).\n", len(bundle.Manifest.Commits))
	return nil
}

func uploadSupersedingHistory(ctx context.Context, cmd *cobra.Command, repoPath string, localCfg config.LocalConfig, previousHead string) error {
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, "")
	if err != nil {
		return err
	}
	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	if err := writeRewriteMarker(repoPath, previousHead, head); err != nil {
		return err
	}
	if err := uploadOrStoreRebaseSyncBundle(ctx, repoPath, localCfg.RelayEntryID, bundle); err != nil {
		return err
	}
	if err := workspace.UpdateSyncedHead(repoPath, head); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "History rewrite detected. Uploaded superseding bundle from %s to %s.\n", previousHead, head)
	return nil
}

func historyContains(repoPath, sha string) (bool, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return false, err
	}
	head, err := repo.Head()
	if err != nil {
		return false, err
	}
	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return false, err
	}
	defer iter.Close()
	found := false
	err = iter.ForEach(func(commit *object.Commit) error {
		if commit.Hash.String() == sha {
			found = true
			return stopRebaseLog
		}
		return nil
	})
	if err != nil && err != stopRebaseLog {
		return false, err
	}
	return found, nil
}

func writeRewriteMarker(repoPath, from, to string) error {
	content := fmt.Sprintf("from = %q\nto = %q\n", from, to)
	_, err := config.WriteLocalFile(filepath.Join(config.GitfuseDir(repoPath), "history-rewrite"), []byte(content), 0o600)
	return err
}

func mergeBase(repoPath, left, right string) (string, error) {
	out, err := gitOutput(repoPath, "merge-base", left, right)
	if err != nil {
		return "", err
	}
	base := strings.TrimSpace(out)
	if base == "" {
		return "", fmt.Errorf("no merge base found between relay head %s and local head %s", left, right)
	}
	return base, nil
}

func uploadOrStoreRebaseSyncBundle(ctx context.Context, repoPath, relayEntryID string, bundle gfgit.BundlePayload) error {
	relayURL, urlErr := relayBaseURLOrError()
	token := deviceToken()
	if urlErr != nil || token == "" {
		_, err := config.WriteLocalFile(filepath.Join(config.GitfuseDir(repoPath), "rebase-sync.bundle"), bundle.Bytes, 0o600)
		return err
	}
	client := relay.NewClient(strings.TrimRight(relayURL, "/"), token)
	queued, _, err := relay.UploadOrQueue(ctx, client, repoPath, relay.UploadRequest{
		RelayEntryID: relayEntryID,
		BundleHash:   bundle.SHA256,
		CommitCount:  strconv.Itoa(len(bundle.Manifest.Commits)),
		SizeBytes:    strconv.Itoa(len(bundle.Bytes)),
		Payload:      bundle.Bytes,
		Commits:      relayCommitsFromBundle(bundle.Manifest.Commits),
	})
	if queued.Path != "" {
		return nil
	}
	return err
}

var stopRebaseLog = fmt.Errorf("stop rebase log iteration")
