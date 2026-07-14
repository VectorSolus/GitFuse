package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/gitfuse/gitfuse/apps/cli/internal/platform"
	gogit "github.com/go-git/go-git/v5"
	gogitconfig "github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/spf13/cobra"
)

type initOptions struct {
	public    bool
	private   bool
	github    bool
	gitlab    bool
	bitbucket bool
}

var initOpts initOptions

var initCmd = &cobra.Command{
	Use:   "init [name]",
	Short: "Initialize git, create a platform remote, and register with gitfuse",
	Example: "" +
		"  gitfuse init\n" +
		"  gitfuse init my-project\n" +
		"  gitfuse init my-project --private --github",
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runInit(cmd, initOpts, args)
	},
}

func init() {
	initCmd.Flags().BoolVar(&initOpts.public, "public", false, "create a public remote repository")
	initCmd.Flags().BoolVar(&initOpts.private, "private", false, "create a private remote repository")
	initCmd.Flags().BoolVar(&initOpts.github, "github", false, "create the remote on GitHub")
	initCmd.Flags().BoolVar(&initOpts.gitlab, "gitlab", false, "create the remote on GitLab")
	initCmd.Flags().BoolVar(&initOpts.bitbucket, "bitbucket", false, "create the remote on Bitbucket")
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, opts initOptions, args []string) error {
	if opts.public && opts.private {
		return fmt.Errorf("choose only one of --public or --private")
	}
	provider, err := selectedProvider(opts)
	if err != nil {
		return err
	}
	repoPath, err := os.Getwd()
	if err != nil {
		return err
	}
	nameArg := ""
	if len(args) > 0 {
		nameArg = args[0]
	}
	name, err := resolveInitRepositoryName(repoPath, nameArg)
	if err != nil {
		return err
	}
	repo, err := openOrInitRepository(repoPath)
	if err != nil {
		return err
	}
	if err := ensureInitialCommit(repo); err != nil {
		return err
	}
	remote, err := platform.CreateRepository(cmd.Context(), platform.CreateRepositoryRequest{
		Name:       name,
		Private:    opts.private,
		Provider:   provider,
		APIToken:   os.Getenv(platformTokenEnv(provider)),
		APIBaseURL: os.Getenv("GITFUSE_PLATFORM_API_URL"),
	})
	if err != nil {
		return err
	}
	if err := setOrigin(repo, remote.CloneURL); err != nil {
		return err
	}
	if err := runAdd(cmd.Context(), cmd); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Initialized %s %s repository %s.\n", remote.Visibility, remote.Provider, remote.CloneURL)
	return nil
}

func resolveInitRepositoryName(repoPath, arg string) (string, error) {
	name := arg
	if strings.TrimSpace(name) == "" {
		name = filepath.Base(filepath.Clean(repoPath))
	}
	return normalizeInitRepositoryName(name)
}

func normalizeInitRepositoryName(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("repository name is required")
	}

	var builder strings.Builder
	lastDash := false
	for _, r := range trimmed {
		switch {
		case isInitRepositoryNameRune(r):
			builder.WriteRune(r)
			lastDash = false
		case r == '-' || unicode.IsSpace(r):
			if !lastDash {
				builder.WriteByte('-')
				lastDash = true
			}
		default:
			return "", fmt.Errorf("invalid repository name %q: use letters, numbers, '.', '_' or '-'", trimmed)
		}
	}

	name := strings.Trim(builder.String(), "-")
	if name == "" || name == "." || name == ".." || strings.Trim(name, "._-") == "" {
		return "", fmt.Errorf("invalid repository name %q: use letters, numbers, '.', '_' or '-'", trimmed)
	}
	if len(name) > 100 {
		return "", fmt.Errorf("invalid repository name %q: must be 100 characters or fewer", trimmed)
	}
	return name, nil
}

func isInitRepositoryNameRune(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '.' ||
		r == '_'
}

func selectedProvider(opts initOptions) (string, error) {
	selected := []string{}
	if opts.github {
		selected = append(selected, "github")
	}
	if opts.gitlab {
		selected = append(selected, "gitlab")
	}
	if opts.bitbucket {
		selected = append(selected, "bitbucket")
	}
	if len(selected) == 0 {
		return "github", nil
	}
	if len(selected) > 1 {
		return "", fmt.Errorf("choose only one platform")
	}
	return selected[0], nil
}

func openOrInitRepository(repoPath string) (*gogit.Repository, error) {
	repo, err := gogit.PlainOpenWithOptions(repoPath, &gogit.PlainOpenOptions{DetectDotGit: true})
	if err == nil {
		return repo, nil
	}
	return gogit.PlainInit(repoPath, false)
}

func ensureInitialCommit(repo *gogit.Repository) error {
	if _, err := repo.Head(); err == nil {
		return nil
	}
	worktree, err := repo.Worktree()
	if err != nil {
		return err
	}
	_, err = worktree.Commit("gitfuse initial commit", &gogit.CommitOptions{
		AllowEmptyCommits: true,
		Author: &object.Signature{
			Name:  "gitfuse",
			Email: "gitfuse@example.invalid",
			When:  time.Now(),
		},
	})
	return err
}

func setOrigin(repo *gogit.Repository, remoteURL string) error {
	if remoteURL == "" {
		return fmt.Errorf("platform did not return a remote URL")
	}
	if _, err := repo.Remote("origin"); err == nil {
		if err := repo.DeleteRemote("origin"); err != nil {
			return err
		}
	}
	_, err := repo.CreateRemote(&gogitconfig.RemoteConfig{Name: "origin", URLs: []string{remoteURL}})
	return err
}

func platformTokenEnv(provider string) string {
	switch strings.ToLower(provider) {
	case "github":
		return "GITHUB_TOKEN"
	case "gitlab":
		return "GITLAB_TOKEN"
	case "bitbucket":
		return "BITBUCKET_TOKEN"
	default:
		return ""
	}
}
