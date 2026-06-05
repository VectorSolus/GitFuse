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
	SyncedHead      string
	PendingCommits  []string
	DisposedCommits []string
	QueuedBundles   []string
	LastPullDevice  string
	LastPullAt      string
	Paused          bool
}

func WriteLedger(repoPath string, ledger Ledger) (string, error) {
	path := filepath.Join(config.GitfuseDir(repoPath), "ledger")
	content := fmt.Sprintf(`[state]
synced_head = %q
pending_commits = []
disposed_commits = []
queued_bundles = []
last_pull_device = %q
last_pull_at = %q
paused = %t
`,
		ledger.SyncedHead,
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
		SyncedHead:     tomlString(text, "synced_head"),
		LastPullDevice: tomlString(text, "last_pull_device"),
		LastPullAt:     tomlString(text, "last_pull_at"),
		Paused:         strings.Contains(text, "paused = true"),
	}, nil
}

func UpdateSyncedHead(repoPath, syncedHead string) error {
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
