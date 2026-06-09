package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
)

type Ledger struct {
	SyncedHead         string
	PreviousSyncedHead string
	PendingCommits     []string
	DisposedCommits    []string
	QueuedBundles      []string
	LastPullDevice     string
	LastPullAt         string
	Paused             bool
}

func WriteLedger(repoPath string, ledger Ledger) (string, error) {
	path := filepath.Join(config.GitfuseDir(repoPath), "ledger")
	content := fmt.Sprintf(`[state]
synced_head = %q
previous_synced_head = %q
pending_commits = %s
disposed_commits = %s
queued_bundles = %s
last_pull_device = %q
last_pull_at = %q
paused = %t
`,
		ledger.SyncedHead,
		ledger.PreviousSyncedHead,
		tomlStringArray(ledger.PendingCommits),
		tomlStringArray(ledger.DisposedCommits),
		tomlStringArray(ledger.QueuedBundles),
		ledger.LastPullDevice,
		ledger.LastPullAt,
		ledger.Paused,
	)
	return config.WriteLocalFile(path, []byte(content), 0o644)
}

func ReadLedger(repoPath string) (Ledger, error) {
	path := filepath.Join(config.GitfuseDir(repoPath), "ledger")
	content, err := os.ReadFile(path)
	if err != nil {
		return Ledger{}, err
	}
	text := string(content)
	return Ledger{
		SyncedHead:         tomlString(text, "synced_head"),
		PreviousSyncedHead: tomlString(text, "previous_synced_head"),
		PendingCommits:     tomlArray(text, "pending_commits"),
		DisposedCommits:    tomlArray(text, "disposed_commits"),
		QueuedBundles:      tomlArray(text, "queued_bundles"),
		LastPullDevice:     tomlString(text, "last_pull_device"),
		LastPullAt:         tomlString(text, "last_pull_at"),
		Paused:             strings.Contains(text, "paused = true"),
	}, nil
}

func UpdateSyncedHead(repoPath, syncedHead string) error {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return err
	}
	ledger.PreviousSyncedHead = ledger.SyncedHead
	ledger.SyncedHead = syncedHead
	_, err = WriteLedger(repoPath, ledger)
	return err
}

func AddDisposedCommit(repoPath, commit string) error {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return err
	}
	for _, existing := range ledger.DisposedCommits {
		if existing == commit {
			_, err = WriteLedger(repoPath, ledger)
			return err
		}
	}
	ledger.DisposedCommits = append(ledger.DisposedCommits, commit)
	_, err = WriteLedger(repoPath, ledger)
	return err
}

func AddDisposedCommits(repoPath string, commits []string) error {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return err
	}
	seen := make(map[string]bool, len(ledger.DisposedCommits)+len(commits))
	for _, existing := range ledger.DisposedCommits {
		seen[existing] = true
	}
	for _, commit := range commits {
		if commit == "" || seen[commit] {
			continue
		}
		ledger.DisposedCommits = append(ledger.DisposedCommits, commit)
		seen[commit] = true
	}
	_, err = WriteLedger(repoPath, ledger)
	return err
}

func UndoLastSync(repoPath string) (string, error) {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return "", err
	}
	restored := ledger.PreviousSyncedHead
	ledger.SyncedHead = restored
	ledger.PreviousSyncedHead = ""
	_, err = WriteLedger(repoPath, ledger)
	return restored, err
}

func SetPaused(repoPath string, paused bool) error {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return err
	}
	ledger.Paused = paused
	_, err = WriteLedger(repoPath, ledger)
	return err
}

func SetSyncedHeadForSelection(repoPath, syncedHead string) error {
	ledger, err := ReadLedger(repoPath)
	if err != nil {
		return err
	}
	ledger.SyncedHead = syncedHead
	_, err = WriteLedger(repoPath, ledger)
	return err
}

func tomlString(text, key string) string {
	match := regexp.MustCompile(key + `\s*=\s*"([^"]*)"`).FindStringSubmatch(text)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}

func tomlStringArray(values []string) string {
	if len(values) == 0 {
		return "[]"
	}
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

func tomlArray(text, key string) []string {
	match := regexp.MustCompile(key + `\s*=\s*\[([^\]]*)\]`).FindStringSubmatch(text)
	if len(match) != 2 || strings.TrimSpace(match[1]) == "" {
		return nil
	}
	itemMatches := regexp.MustCompile(`"([^"]*)"`).FindAllStringSubmatch(match[1], -1)
	values := make([]string, 0, len(itemMatches))
	for _, item := range itemMatches {
		if len(item) == 2 {
			values = append(values, item[1])
		}
	}
	return values
}
