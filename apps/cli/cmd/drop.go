package cmd

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/spf13/cobra"
)

type dropOptions struct {
	pick  bool
	force bool
}

var dropOpts dropOptions

var dropCmd = &cobra.Command{
	Use:   "drop [commit]",
	Short: "Remove a relay-side commit from gitfuse curation",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		commitish := "HEAD"
		if len(args) == 1 {
			commitish = args[0]
		}
		return runDrop(cmd.Context(), cmd, dropOpts, commitish)
	},
}

func init() {
	dropCmd.Flags().BoolVar(&dropOpts.pick, "pick", false, "select commits interactively")
	dropCmd.Flags().BoolVar(&dropOpts.force, "force", false, "skip confirmation")
	rootCmd.AddCommand(dropCmd)
}

func runDrop(ctx context.Context, cmd *cobra.Command, opts dropOptions, commitish string) error {
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return err
	}
	commit, err := resolveCommit(repo, commitish)
	if err != nil {
		return err
	}

	if opts.pick {
		fmt.Fprintln(cmd.OutOrStdout(), "Pick mode requested; showing selected commit details.")
	}
	printCommitDetails(cmd, "Drop relay-side commit", commit)
	if !opts.force {
		confirmed, err := confirm(cmd, "Drop this commit from the relay view? Type yes to continue: ")
		if err != nil {
			return err
		}
		if !confirmed {
			fmt.Fprintln(cmd.OutOrStdout(), "Drop cancelled. Local git history untouched.")
			return nil
		}
	}

	if err := workspace.AddDisposedCommit(repoPath, commit.Hash.String()); err != nil {
		return err
	}
	if err := deleteRelayBundleIfConfigured(ctx, commit.Hash.String()); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Dropped relay-side commit %s. Local git history untouched.\n", commit.Hash.String())
	return nil
}

func resolveCommit(repo *gogit.Repository, commitish string) (*objectCommit, error) {
	hash, err := repo.ResolveRevision(plumbing.Revision(commitish))
	if err != nil {
		return nil, err
	}
	commit, err := repo.CommitObject(*hash)
	if err != nil {
		return nil, err
	}
	return &objectCommit{
		Hash:    commit.Hash,
		Author:  commit.Author.String(),
		Message: strings.TrimSpace(commit.Message),
	}, nil
}

type objectCommit struct {
	Hash    plumbing.Hash
	Author  string
	Message string
}

func printCommitDetails(cmd *cobra.Command, title string, commit *objectCommit) {
	fmt.Fprintln(cmd.OutOrStdout(), title)
	fmt.Fprintf(cmd.OutOrStdout(), "Commit: %s\n", commit.Hash.String())
	fmt.Fprintf(cmd.OutOrStdout(), "Author: %s\n", commit.Author)
	if commit.Message != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Message: %s\n", firstLine(commit.Message))
	}
}

func confirm(cmd *cobra.Command, prompt string) (bool, error) {
	fmt.Fprint(cmd.OutOrStdout(), prompt)
	reader := bufio.NewReader(cmd.InOrStdin())
	answer, err := reader.ReadString('\n')
	if err != nil && strings.TrimSpace(answer) == "" {
		return false, err
	}
	return strings.EqualFold(strings.TrimSpace(answer), "yes"), nil
}

func deleteRelayBundleIfConfigured(ctx context.Context, fallbackID string) error {
	relayURL := strings.TrimRight(os.Getenv("GITFUSE_RELAY_URL"), "/")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	bundleID := os.Getenv("GITFUSE_DROP_BUNDLE_ID")
	if bundleID == "" {
		bundleID = os.Getenv("GITFUSE_UNDO_BUNDLE_ID")
	}
	if relayURL == "" || token == "" || bundleID == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, relayURL+"/v1/bundles/"+bundleID, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("relay delete failed for %s with status %d", fallbackID, resp.StatusCode)
	}
	return nil
}

func firstLine(message string) string {
	line := strings.SplitN(message, "\n", 2)[0]
	return strings.TrimSpace(line)
}
