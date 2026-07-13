package git

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func testRepo(t *testing.T) (string, *gogit.Repository, plumbing.Hash) {
	t.Helper()
	dir := t.TempDir()
	repo, err := gogit.PlainInit(dir, false)
	if err != nil {
		t.Fatal(err)
	}
	root := commitFile(t, dir, repo, "README.md", "root\n", "root", time.Unix(1, 0))
	return dir, repo, root
}

func commitFile(t *testing.T, dir string, repo *gogit.Repository, name, content, message string, when time.Time) plumbing.Hash {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	worktree, err := repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := worktree.Add(name); err != nil {
		t.Fatal(err)
	}
	hash, err := worktree.Commit(message, &gogit.CommitOptions{
		Author: &object.Signature{Name: "gitfuse", Email: "test@gitfuse.dev", When: when},
	})
	if err != nil {
		t.Fatal(err)
	}
	return hash
}

func TestGetRootSHA(t *testing.T) {
	dir, repo, root := testRepo(t)
	_ = commitFile(t, dir, repo, "app.txt", "second\n", "second", time.Unix(2, 0))

	got, err := RootSHA(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != root.String() {
		t.Fatalf("root SHA = %s, want %s", got, root.String())
	}
}

func TestPreflightCheck(t *testing.T) {
	dir, _, _ := testRepo(t)
	if err := PreflightCheck(dir); err != nil {
		t.Fatalf("clean repo preflight failed: %v", err)
	}

	if err := PreflightCheck(filepath.Join(t.TempDir(), "missing")); !errors.Is(err, ErrRepositoryPreflight) {
		t.Fatalf("missing repo error = %v, want ErrRepositoryPreflight", err)
	}
}

func TestLayerOneValidation(t *testing.T) {
	if err := ValidateLayerOneRoot("abc", "abc"); err != nil {
		t.Fatalf("matching roots failed: %v", err)
	}
	if err := ValidateLayerOneRoot("abc", "def"); !errors.Is(err, ErrRootSHAMismatch) {
		t.Fatalf("mismatch error = %v, want ErrRootSHAMismatch", err)
	}
	if err := ValidateLayerOneRoot("abc", "def"); err == nil {
		t.Fatal("root SHA mismatch was bypassed")
	}
}

func TestParentChainVerification(t *testing.T) {
	local := map[string]struct{}{"root": {}, "local-head": {}}
	result, err := VerifyParentChain(local, []string{"local-head"})
	if err != nil {
		t.Fatalf("connected chain failed: %v", err)
	}
	if result.DivergencePoint != "local-head" {
		t.Fatalf("divergence point = %s, want local-head", result.DivergencePoint)
	}

	result, err = VerifyParentChain(local, []string{"foreign-head"})
	if !errors.Is(err, ErrParentChainDiverged) {
		t.Fatalf("disconnected error = %v, want ErrParentChainDiverged", err)
	}
	if result.DivergencePoint != "foreign-head" {
		t.Fatalf("divergence point = %s, want foreign-head", result.DivergencePoint)
	}
}

func TestRootSHAFromRepositoryNoHead(t *testing.T) {
	repo, err := gogit.PlainInit(t.TempDir(), false)
	if err != nil {
		t.Fatal(err)
	}
	_, err = RootSHAFromRepository(repo)
	if !errors.Is(err, ErrMissingRepositoryHead) && !errors.Is(err, plumbing.ErrReferenceNotFound) {
		t.Fatalf("empty repo error = %v, want missing head", err)
	}
}

func TestHasUnbornHEAD(t *testing.T) {
	dir := t.TempDir()
	if _, err := gogit.PlainInit(dir, false); err != nil {
		t.Fatal(err)
	}
	unborn, err := HasUnbornHEAD(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !unborn {
		t.Fatal("newly initialized repository should have an unborn HEAD")
	}

	committedDir, _, _ := testRepo(t)
	unborn, err = HasUnbornHEAD(committedDir)
	if err != nil {
		t.Fatal(err)
	}
	if unborn {
		t.Fatal("repository with a committed HEAD was reported as unborn")
	}
}
