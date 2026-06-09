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
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := gfgit.PreflightCheck(repoPath); err != nil {
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
	contains, err := historyContains(repoPath, ledger.SyncedHead)
	if err != nil {
		return err
	}
	if contains {
		fmt.Fprintln(cmd.OutOrStdout(), "No rewritten history detected.")
		return nil
	}
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, "")
	if err != nil {
		return err
	}
	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	if err := writeRewriteMarker(repoPath, ledger.SyncedHead, head); err != nil {
		return err
	}
	if err := uploadOrStoreSupersedingBundle(ctx, repoPath, localCfg.RelayEntryID, bundle); err != nil {
		return err
	}
	if err := workspace.UpdateSyncedHead(repoPath, head); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "History rewrite detected. Uploaded superseding bundle from %s to %s.\n", ledger.SyncedHead, head)
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

func uploadOrStoreSupersedingBundle(ctx context.Context, repoPath, relayEntryID string, bundle gfgit.BundlePayload) error {
	relayURL := os.Getenv("GITFUSE_RELAY_URL")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL == "" || token == "" {
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
	})
	if queued.Path != "" {
		return nil
	}
	return err
}

var stopRebaseLog = fmt.Errorf("stop rebase log iteration")
