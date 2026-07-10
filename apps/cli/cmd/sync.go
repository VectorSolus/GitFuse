package cmd

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/spf13/cobra"
)

type syncOptions struct {
	pick    bool
	dryRun  bool
	all     bool
	dispose string
}

var syncOpts syncOptions
var submoduleWarningPrinted bool

var syncCmd = &cobra.Command{
	Use:   "sync [range]",
	Short: "Upload selected committed git objects to the relay",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		commitRange := ""
		if len(args) == 1 {
			commitRange = args[0]
		}
		return runSync(cmd.Context(), cmd, syncOpts, commitRange)
	},
}

func init() {
	syncCmd.Flags().BoolVar(&syncOpts.pick, "pick", false, "select commits interactively")
	syncCmd.Flags().BoolVar(&syncOpts.dryRun, "dry-run", false, "preview sync without uploading")
	syncCmd.Flags().BoolVar(&syncOpts.all, "all", false, "sync all commits")
	syncCmd.Flags().StringVar(&syncOpts.dispose, "dispose", "", "mark a commit as disposed")
	rootCmd.AddCommand(syncCmd)
}

func runSync(ctx context.Context, cmd *cobra.Command, opts syncOptions, commitRange string) error {
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
	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	ledger, _, err = repairLedgerSyncedHeadIfNeeded(repoPath, ledger)
	if err != nil {
		return err
	}
	relayRows, relayCandidates, err := activeRelayMetadata(ctx, localCfg)
	if err != nil {
		return fmt.Errorf("validate relay head before sync: %w", err)
	}
	blockers, err := blockingRelayHeadCandidates(repoPath, head, relayCandidates, localDeviceID())
	if err != nil {
		return err
	}
	ledger, _, err = repairLedgerForBlockingRelayHeadsIfNeeded(repoPath, ledger, head, blockers)
	if err != nil {
		return err
	}
	if len(blockers) > 0 {
		return fmt.Errorf("remote has new commits not included in local HEAD. Pull/rebase before syncing.")
	}
	if ledger.Paused {
		fmt.Fprintln(cmd.OutOrStdout(), "gitfuse is paused. Run 'gitfuse resume' to sync again.")
		return nil
	}
	ledger, _, err = repairLedgerToLocalHeadForLegacyRelayRowsIfSafe(repoPath, ledger, head, relayRows, relayCandidates)
	if err != nil {
		return err
	}
	syncedHead := ledger.SyncedHead
	if opts.all {
		syncedHead = ""
	} else {
		syncedHead, err = effectiveRelaySyncBase(repoPath, ledger, head, relayCandidates)
		if err != nil {
			return err
		}
		ledger, _, err = advanceLedgerToReachableRelayHeadIfNeeded(repoPath, ledger, head, syncedHead)
		if err != nil {
			return err
		}
	}
	ahead, err := gfgit.CommitCountAfter(repoPath, syncedHead)
	if err != nil {
		return err
	}
	if ahead == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No commits to sync.")
		return nil
	}
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, syncedHead)
	if err != nil {
		return err
	}
	if err := printSubmoduleWarningOnce(cmd, repoPath, bundle.Submodules, &ledger); err != nil {
		return err
	}
	if opts.dryRun {
		fmt.Fprintf(cmd.OutOrStdout(), "Dry run: %d commit(s) ready to sync.\n", len(bundle.Manifest.Commits))
		if commitRange != "" {
			fmt.Fprintf(cmd.OutOrStdout(), "Range: %s\n", commitRange)
		}
		if opts.pick {
			fmt.Fprintln(cmd.OutOrStdout(), "Pick mode requested.")
		}
		return nil
	}
	if opts.dispose != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Disposed commit: %s\n", opts.dispose)
	}

	encrypted := bundle.Bytes
	token := deviceToken()
	if token == "" {
		return fmt.Errorf("not authenticated; run 'gitfuse auth' first")
	}
	client := relay.NewClient(relayBaseURL(), token)
	queued, message, err := relay.UploadOrQueue(ctx, client, repoPath, relay.UploadRequest{
		RelayEntryID: localCfg.RelayEntryID,
		BundleHash:   bundle.SHA256,
		CommitCount:  strconv.Itoa(len(bundle.Manifest.Commits)),
		SizeBytes:    strconv.Itoa(len(encrypted)),
		Payload:      encrypted,
		Commits:      relayCommitsFromBundle(bundle.Manifest.Commits),
	})
	if err != nil {
		if message != "" {
			fmt.Fprintln(cmd.OutOrStdout(), message)
		}
		if queued.Path != "" {
			return nil
		}
		return err
	}

	if err := workspace.UpdateSyncedHead(repoPath, head); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Synced %d commit(s).\n", len(bundle.Manifest.Commits))
	return nil
}

func relayCommitsFromBundle(commits []gfgit.BundleCommit) []relay.SyncedCommit {
	if len(commits) == 0 {
		return nil
	}
	converted := make([]relay.SyncedCommit, 0, len(commits))
	for _, commit := range commits {
		converted = append(converted, relay.SyncedCommit{
			SHA:         commit.SHA,
			Message:     commit.Message,
			AuthorName:  commit.AuthorName,
			AuthorEmail: commit.AuthorEmail,
			AuthoredAt:  commit.AuthoredAt,
			CommittedAt: commit.CommittedAt,
		})
	}
	return converted
}

func printSubmoduleWarningOnce(cmd *cobra.Command, repoPath string, submodules []gfgit.BundleSubmodule, ledger *workspace.Ledger) error {
	if len(submodules) == 0 || submoduleWarningPrinted || ledger.SubmoduleWarningShown {
		return nil
	}
	submoduleWarningPrinted = true
	ledger.SubmoduleWarningShown = true
	fmt.Fprintf(
		cmd.OutOrStdout(),
		"Warning: Submodules detected at %s. gitfuse sync records gitlink references only and never syncs submodule contents.\n",
		submodules[0].Path,
	)
	_, err := workspace.WriteLedger(repoPath, *ledger)
	return err
}

func currentHead(repoPath string) (string, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return "", err
	}
	head, err := repo.Head()
	if err != nil {
		return "", err
	}
	return head.Hash().String(), nil
}
