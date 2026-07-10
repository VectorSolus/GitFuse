package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

type statusOptions struct {
	all bool
}

var statusOpts statusOptions

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show gitfuse sync status for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runStatus(cmd, statusOpts)
	},
}

func init() {
	statusCmd.Flags().BoolVar(&statusOpts.all, "all", false, "show all registered repositories visible from the current tree")
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, opts statusOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if opts.all {
		return printAllStatuses(cmd, repoPath)
	}
	status, err := collectRepoStatus(repoPath)
	if err != nil {
		return err
	}
	printRepoStatus(cmd, status)
	return nil
}

type repoStatus struct {
	Path          string
	DisplayName   string
	RelayEntryID  string
	CommitsAhead  int
	RelayState    string
	QueuedBundles int
	Paused        bool
	ExpiresAt     *time.Time
}

func collectRepoStatus(repoPath string) (repoStatus, error) {
	localCfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		return repoStatus{}, fmt.Errorf("read .gitfuse/config: %w", err)
	}
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		return repoStatus{}, fmt.Errorf("read .gitfuse/ledger: %w", err)
	}
	ledger, _, err = repairLedgerSyncedHeadIfNeeded(repoPath, ledger)
	if err != nil {
		return repoStatus{}, err
	}
	if relayRows, relayCandidates, err := activeRelayMetadata(context.Background(), localCfg); err == nil && len(relayRows) > 0 {
		head, err := currentHead(repoPath)
		if err != nil {
			return repoStatus{}, err
		}
		blockers, err := blockingRelayHeadCandidates(repoPath, head, relayCandidates, localDeviceID())
		if err != nil {
			return repoStatus{}, err
		}
		ledger, _, err = repairLedgerForBlockingRelayHeadsIfNeeded(repoPath, ledger, head, blockers)
		if err != nil {
			return repoStatus{}, err
		}
		if len(blockers) == 0 {
			if len(relayCandidates) == 0 {
				repaired, _, err := repairLedgerToLocalHeadForLegacyRelayRowsIfSafe(repoPath, ledger, head, relayRows, relayCandidates)
				if err != nil {
					return repoStatus{}, err
				}
				ledger = repaired
			} else if syncedHead, err := effectiveRelaySyncBase(repoPath, ledger, head, relayCandidates); err != nil {
				return repoStatus{}, err
			} else {
				repaired, _, err := advanceLedgerToReachableRelayHeadIfNeeded(repoPath, ledger, head, syncedHead)
				if err != nil {
					return repoStatus{}, err
				}
				ledger = repaired
				ledger.SyncedHead = syncedHead
			}
		}
	}
	ahead, err := commitsAhead(repoPath, ledger.SyncedHead)
	if err != nil {
		return repoStatus{}, err
	}
	queued, err := queuedBundleCount(repoPath)
	if err != nil {
		return repoStatus{}, err
	}
	expiresAt, err := earliestExpiry(repoPath, localCfg.RelayEntryID)
	if err != nil {
		return repoStatus{}, err
	}
	relayState := "local cache"
	if ledger.SyncedHead != "" {
		relayState = "synced"
	}
	if queued > 0 {
		relayState = "queued"
	}
	if ledger.Paused {
		relayState = "paused"
	}
	return repoStatus{
		Path:          repoPath,
		DisplayName:   localCfg.DisplayName,
		RelayEntryID:  localCfg.RelayEntryID,
		CommitsAhead:  ahead,
		RelayState:    relayState,
		QueuedBundles: queued,
		Paused:        ledger.Paused,
		ExpiresAt:     expiresAt,
	}, nil
}

func printRepoStatus(cmd *cobra.Command, status repoStatus) {
	fmt.Fprintf(cmd.OutOrStdout(), "Repository: %s\n", status.DisplayName)
	fmt.Fprintf(cmd.OutOrStdout(), "Relay entry: %s\n", status.RelayEntryID)
	fmt.Fprintf(cmd.OutOrStdout(), "Commits ahead: %d\n", status.CommitsAhead)
	fmt.Fprintf(cmd.OutOrStdout(), "Relay state: %s\n", status.RelayState)
	fmt.Fprintf(cmd.OutOrStdout(), "Queued bundles: %d\n", status.QueuedBundles)
	fmt.Fprintf(cmd.OutOrStdout(), "Paused: %t\n", status.Paused)
	if status.ExpiresAt != nil && time.Until(*status.ExpiresAt) <= 7*24*time.Hour && time.Until(*status.ExpiresAt) > 0 {
		fmt.Fprintf(cmd.OutOrStdout(), "Expiry warning: bundles expire on %s.\n", status.ExpiresAt.UTC().Format(time.RFC3339))
	}
}

func printAllStatuses(cmd *cobra.Command, repoPath string) error {
	statuses, err := discoverRegisteredRepos(repoPath)
	if err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "PATH\tREPOSITORY\tAHEAD\tSTATE\tQUEUE")
	for _, status := range statuses {
		fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%d\t%s\t%d\n",
			status.Path,
			status.DisplayName,
			status.CommitsAhead,
			status.RelayState,
			status.QueuedBundles,
		)
	}
	return nil
}

func discoverRegisteredRepos(start string) ([]repoStatus, error) {
	registry, registryErr := config.ReadRepositoryRegistry()
	if registryErr == nil && len(registry.Entries) > 0 {
		statuses := make([]repoStatus, 0, len(registry.Entries))
		for _, entry := range registry.Entries {
			status, err := collectRepoStatus(entry.Path)
			if err != nil {
				status = repoStatus{
					Path:         entry.Path,
					DisplayName:  entry.Name,
					RelayEntryID: entry.RelayEntryID,
					RelayState:   "registered",
				}
			}
			statuses = append(statuses, status)
		}
		return statuses, nil
	}

	root := start
	if repoRoot, err := findRepoRoot(start); err == nil {
		root = filepath.Dir(repoRoot)
	}
	var statuses []repoStatus
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			return nil
		}
		name := entry.Name()
		if name == ".git" || name == "node_modules" || name == ".next" || name == ".turbo" {
			return filepath.SkipDir
		}
		if name == ".gitfuse" {
			repoPath := filepath.Dir(path)
			status, err := collectRepoStatus(repoPath)
			if err == nil {
				statuses = append(statuses, status)
			}
			return filepath.SkipDir
		}
		return nil
	})
	return statuses, err
}

func commitsAhead(repoPath, syncedHead string) (int, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return 0, err
	}
	head, err := repo.Head()
	if err != nil {
		return 0, err
	}
	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		return 0, err
	}
	defer iter.Close()
	count := 0
	err = iter.ForEach(func(commit *object.Commit) error {
		if syncedHead != "" && commit.Hash.String() == syncedHead {
			return stopStatusLog
		}
		count++
		return nil
	})
	if err != nil && err != stopStatusLog {
		return 0, err
	}
	return count, nil
}

func queuedBundleCount(repoPath string) (int, error) {
	entries, err := os.ReadDir(relay.QueueDir(repoPath))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".bundle.enc") {
			count++
		}
	}
	return count, nil
}

func earliestExpiry(repoPath, relayEntryID string) (*time.Time, error) {
	if override := os.Getenv("GITFUSE_STATUS_EXPIRES_AT"); override != "" {
		parsed, err := time.Parse(time.RFC3339, override)
		if err != nil {
			return nil, err
		}
		return &parsed, nil
	}
	token := deviceToken()
	if token == "" || relayEntryID == "" {
		return nil, nil
	}
	req, err := http.NewRequest(http.MethodGet, relayBaseURL()+"/v1/bundles/"+relayEntryID, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil
	}
	var decoded struct {
		Bundles []struct {
			ExpiresAt string `json:"expiresAt"`
		} `json:"bundles"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}
	var earliest *time.Time
	for _, bundle := range decoded.Bundles {
		if bundle.ExpiresAt == "" {
			continue
		}
		parsed, err := time.Parse(time.RFC3339, bundle.ExpiresAt)
		if err != nil {
			continue
		}
		if earliest == nil || parsed.Before(*earliest) {
			next := parsed
			earliest = &next
		}
	}
	return earliest, nil
}

func findRepoRoot(start string) (string, error) {
	current := start
	for {
		if _, err := os.Stat(filepath.Join(current, ".git")); err == nil {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", fmt.Errorf("git repository root not found")
		}
		current = parent
	}
}

var stopStatusLog = fmt.Errorf("stop status log iteration")
