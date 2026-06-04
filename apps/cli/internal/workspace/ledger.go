package workspace

import (
	"fmt"
	"path/filepath"

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
