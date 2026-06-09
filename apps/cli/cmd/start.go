package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
	"github.com/spf13/cobra"
)

type startOptions struct {
	auto           bool
	delay          string
	daemon         bool
	retryQueueOnce bool
}

var startOpts startOptions

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start gitfuse automation for this repository",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runStart(cmd.Context(), cmd, startOpts)
	},
}

func init() {
	startCmd.Flags().BoolVar(&startOpts.auto, "auto", false, "install a post-commit hook that runs gitfuse sync")
	startCmd.Flags().StringVar(&startOpts.delay, "delay", "0s", "buffer commits before upload, such as 5s or 2m")
	startCmd.Flags().BoolVar(&startOpts.daemon, "daemon", false, "run the queue retry loop")
	startCmd.Flags().BoolVar(&startOpts.retryQueueOnce, "retry-queue-once", false, "retry queued bundles once")
	_ = startCmd.Flags().MarkHidden("daemon")
	_ = startCmd.Flags().MarkHidden("retry-queue-once")
	rootCmd.AddCommand(startCmd)
}

func runStart(ctx context.Context, cmd *cobra.Command, opts startOptions) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	if opts.retryQueueOnce {
		return retryQueuedBundlesOnce(ctx, cmd, repoPath)
	}
	if opts.daemon {
		return runQueueRetryLoop(ctx, cmd, repoPath)
	}
	if !opts.auto {
		return fmt.Errorf("start requires --auto")
	}
	delay, err := parseAutoDelay(opts.delay)
	if err != nil {
		return err
	}
	if err := installAutoSyncHook(repoPath, delay); err != nil {
		return err
	}
	if err := retryQueuedBundlesOnce(ctx, cmd, repoPath); err != nil {
		return err
	}
	if delay > 0 {
		fmt.Fprintf(cmd.OutOrStdout(), "gitfuse auto sync enabled with %s delay.\n", delay)
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "gitfuse auto sync enabled.")
	return nil
}

func parseAutoDelay(value string) (time.Duration, error) {
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	delay, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse --delay: %w", err)
	}
	if delay < 0 {
		return 0, fmt.Errorf("--delay must not be negative")
	}
	return delay, nil
}

func installAutoSyncHook(repoPath string, delay time.Duration) error {
	hooksDir := filepath.Join(repoPath, ".git", "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return err
	}
	hookPath := filepath.Join(hooksDir, "post-commit")
	backupPath := filepath.Join(hooksDir, "post-commit.gitfuse-auto.bak")
	existing, err := os.ReadFile(hookPath)
	if err == nil && len(existing) > 0 && !strings.Contains(string(existing), "gitfuse auto sync hook") {
		if err := os.WriteFile(backupPath, existing, 0o755); err != nil {
			return err
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	script := fmt.Sprintf(`#!/bin/sh
# gitfuse auto sync hook
cd %q || exit 0
if [ %d -gt 0 ]; then
  sleep %d
fi
%q start --retry-queue-once >/dev/null 2>&1 || true
%q sync >/dev/null 2>&1 || true
if [ -f %q ]; then
  sh %q
fi
`, repoPath, int(delay.Seconds()), int(delay.Seconds()), exe, exe, backupPath, backupPath)
	return os.WriteFile(hookPath, []byte(script), 0o755)
}

func runQueueRetryLoop(ctx context.Context, cmd *cobra.Command, repoPath string) error {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		if err := retryQueuedBundlesOnce(ctx, cmd, repoPath); err != nil {
			fmt.Fprintf(cmd.ErrOrStderr(), "queue retry failed: %v\n", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func retryQueuedBundlesOnce(ctx context.Context, cmd *cobra.Command, repoPath string) error {
	entries, err := os.ReadDir(relay.QueueDir(repoPath))
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintln(cmd.OutOrStdout(), "No queued bundles to retry.")
			return nil
		}
		return err
	}
	relayURL := os.Getenv("GITFUSE_RELAY_URL")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL == "" || token == "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Queue retry skipped; relay credentials not configured (%d queued bundle(s)).\n", len(bundleQueueFiles(entries)))
		return nil
	}
	localCfg, err := config.ReadLocalConfig(repoPath)
	if err != nil {
		return err
	}
	client := relay.NewClient(strings.TrimRight(relayURL, "/"), token)
	retried := 0
	for _, entry := range bundleQueueFiles(entries) {
		path := filepath.Join(relay.QueueDir(repoPath), entry.Name())
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		hash := relay.SHA256(payload)
		if err := relay.RetryQueuedBundle(ctx, client, path, hash, relay.UploadRequest{
			RelayEntryID: localCfg.RelayEntryID,
			BundleHash:   hash,
			CommitCount:  "0",
			SizeBytes:    strconv.Itoa(len(payload)),
		}); err != nil {
			return err
		}
		if err := os.Remove(path); err != nil {
			return err
		}
		retried++
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Retried %d queued bundle(s).\n", retried)
	return nil
}

func bundleQueueFiles(entries []os.DirEntry) []os.DirEntry {
	files := make([]os.DirEntry, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".bundle.enc") {
			files = append(files, entry)
		}
	}
	return files
}
