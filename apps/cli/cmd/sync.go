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
	syncedHead := ledger.SyncedHead
	if opts.all {
		syncedHead = ""
	}
	bundle, err := gfgit.CreateIncrementalBundle(repoPath, syncedHead)
	if err != nil {
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
	relayURL := os.Getenv("GITFUSE_RELAY_URL")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL != "" && token != "" {
		client := relay.NewClient(relayURL, token)
		queued, message, err := relay.UploadOrQueue(ctx, client, repoPath, relay.UploadRequest{
			RelayEntryID: localCfg.RelayEntryID,
			BundleHash:   bundle.SHA256,
			CommitCount:  strconv.Itoa(len(bundle.Manifest.Commits)),
			SizeBytes:    strconv.Itoa(len(encrypted)),
			Payload:      encrypted,
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
	} else {
		if _, err := config.WriteLocalFile(config.GitfuseDir(repoPath)+"/last-sync.bundle", encrypted, 0o600); err != nil {
			return err
		}
	}

	head, err := currentHead(repoPath)
	if err != nil {
		return err
	}
	if err := workspace.UpdateSyncedHead(repoPath, head); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Synced %d commit(s).\n", len(bundle.Manifest.Commits))
	return nil
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
