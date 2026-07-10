package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

var logCmd = &cobra.Command{
	Use:   "log",
	Short: "Show gitfuse relay-side sync history and commit states",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runLog(cmd)
	},
}

func init() {
	rootCmd.AddCommand(logCmd)
}

type logCommit struct {
	SHA     string
	Message string
	State   string
}

type relayLogEvent struct {
	Type        string `json:"eventType"`
	CommitCount int    `json:"commitCount"`
	CreatedAt   string `json:"createdAt"`
}

func runLog(cmd *cobra.Command) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	localCfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/config: %w", err)
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	ledger, _, err = repairLedgerSyncedHeadIfNeeded(repoPath, ledger)
	if err != nil {
		return err
	}
	if relayCandidates, err := activeRelayHeadCandidates(context.Background(), localCfg); err == nil && len(relayCandidates) > 0 {
		head, err := currentHead(repoPath)
		if err != nil {
			return err
		}
		blockers, err := blockingRelayHeadCandidates(repoPath, head, relayCandidates, localDeviceID())
		if err != nil {
			return err
		}
		ledger, _, err = repairLedgerForBlockingRelayHeadsIfNeeded(repoPath, ledger, head, blockers)
		if err != nil {
			return err
		}
		if len(blockers) == 0 {
			if syncedHead, err := effectiveRelaySyncBase(repoPath, ledger, head, relayCandidates); err != nil {
				return err
			} else {
				ledger.SyncedHead = syncedHead
			}
		}
	}
	commits, err := collectLogCommits(repoPath, ledger)
	if err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Repository: %s\n", localCfg.DisplayName)
	fmt.Fprintf(cmd.OutOrStdout(), "Relay entry: %s\n\n", localCfg.RelayEntryID)
	fmt.Fprintln(cmd.OutOrStdout(), "COMMITS")
	fmt.Fprintln(cmd.OutOrStdout(), "STATE\tSHA\tMESSAGE")
	for _, commit := range commits {
		fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\n", commit.State, shortLogSHA(commit.SHA), commit.Message)
	}
	events, err := loadRelayLogEvents()
	if err != nil {
		return err
	}
	if len(events) > 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "\nRELAY HISTORY")
		fmt.Fprintln(cmd.OutOrStdout(), "TYPE\tCOMMITS\tCREATED")
		for _, event := range events {
			fmt.Fprintf(cmd.OutOrStdout(), "%s\t%d\t%s\n", event.Type, event.CommitCount, event.CreatedAt)
		}
	}
	return nil
}

func collectLogCommits(repoPath string, ledger workspace.Ledger) ([]logCommit, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	dropped := make(map[string]bool, len(ledger.DisposedCommits))
	for _, sha := range ledger.DisposedCommits {
		dropped[sha] = true
	}
	seenSyncedHead := ledger.SyncedHead == ""
	var commits []logCommit
	err = iter.ForEach(func(commit *object.Commit) error {
		state := "local-only"
		if seenSyncedHead {
			state = "synced"
		}
		if commit.Hash.String() == ledger.SyncedHead {
			state = "synced"
			seenSyncedHead = true
		}
		if dropped[commit.Hash.String()] {
			state = "dropped"
		}
		commits = append(commits, logCommit{
			SHA:     commit.Hash.String(),
			Message: strings.TrimSpace(firstLine(commit.Message)),
			State:   state,
		})
		return nil
	})
	return commits, err
}

func loadRelayLogEvents() ([]relayLogEvent, error) {
	fixture := os.Getenv("GITFUSE_LOG_FIXTURE")
	if fixture == "" {
		return nil, nil
	}
	content, err := os.ReadFile(fixture)
	if err != nil {
		return nil, err
	}
	var decoded struct {
		Events []relayLogEvent `json:"events"`
	}
	if err := json.Unmarshal(content, &decoded); err != nil {
		return nil, err
	}
	return decoded.Events, nil
}

func shortLogSHA(sha string) string {
	if len(sha) < 12 {
		return sha
	}
	return sha[:12]
}
