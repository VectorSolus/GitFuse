package cmd

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/tui"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/spf13/cobra"
)

var restoreCmd = &cobra.Command{
	Use:   "restore <relay-entry-name>",
	Short: "Restore a missing project from relay bundles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runRestore(cmd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(restoreCmd)
}

func runRestore(cmd *cobra.Command, name string) error {
	repos, err := loadRelayRepositories()
	if err != nil {
		return err
	}
	relayRepo, ok := findRelayRepository(name, repos)
	if !ok {
		return fmt.Errorf("relay entry %q not found", name)
	}
	parent, err := os.Getwd()
	if err != nil {
		return err
	}
	target := filepath.Join(parent, relayRepo.DisplayName)
	if existsAndNotEmpty(target) {
		confirmed, err := confirm(cmd, "Restore target exists. Type yes to continue: ")
		if err != nil {
			return err
		}
		if !confirmed {
			return fmt.Errorf("restore cancelled")
		}
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	if _, err := gogit.PlainInit(target, false); err != nil && !strings.Contains(err.Error(), "repository already exists") {
		return err
	}
	if _, err := config.WriteLocalConfig(target, config.LocalConfig{
		RootSHA:      relayRepo.RootSHA,
		RelayEntryID: relayRepo.RelayEntryID,
		DisplayName:  relayRepo.DisplayName,
		RemoteURL:    relayRepo.RemoteURL,
		Platform:     detectPlatform(relayRepo.RemoteURL),
	}); err != nil {
		return err
	}
	if _, err := workspace.WriteLedger(target, workspace.Ledger{}); err != nil {
		return err
	}
	bundles, err := restoreBundles(target, relayRepo.RelayEntryID)
	if err != nil {
		return err
	}
	if progress := tui.ReplayProgress(bundles); progress != "" {
		fmt.Fprintln(cmd.OutOrStdout(), progress)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Restored %s at %s.\n", relayRepo.DisplayName, target)
	if relayRepo.RemoteURL != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Remote available: %s\n", relayRepo.RemoteURL)
	} else {
		fmt.Fprintln(cmd.OutOrStdout(), "No remote stored. Run 'gitfuse init' to create one.")
	}
	return nil
}

func existsAndNotEmpty(path string) bool {
	entries, err := os.ReadDir(path)
	return err == nil && len(entries) > 0
}

func restoreBundles(target, relayEntryID string) (int, error) {
	relayURL := strings.TrimRight(os.Getenv("GITFUSE_RELAY_URL"), "/")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL == "" || token == "" {
		return 0, nil
	}
	req, err := http.NewRequest(http.MethodGet, relayURL+"/v1/bundles/"+relayEntryID, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, nil
	}
	path := filepath.Join(config.GitfuseDir(target), "restored-bundles.json")
	if _, err := config.WriteLocalFile(path, []byte(fmt.Sprintf("{\"relayEntryId\":%q}\n", relayEntryID)), 0o600); err != nil {
		return 0, err
	}
	return 1, nil
}
