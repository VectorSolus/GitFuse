package git

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/format/index"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func TestBundleDeltas(t *testing.T) {
	dir, repo, _ := testRepo(t)
	synced := commitFile(t, dir, repo, "synced.txt", "synced\n", "synced", time.Unix(2, 0))
	want := commitFile(t, dir, repo, "new.txt", "new\n", "new", time.Unix(3, 0))

	bundle, err := CreateIncrementalBundle(dir, synced.String())
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Manifest.Commits) != 1 {
		t.Fatalf("bundle commits = %d, want 1", len(bundle.Manifest.Commits))
	}
	if bundle.Manifest.Commits[0].SHA != want.String() {
		t.Fatalf("bundle commit = %s, want %s", bundle.Manifest.Commits[0].SHA, want.String())
	}
}

func TestBundleHashIntegrity(t *testing.T) {
	dir, _, _ := testRepo(t)
	bundle, err := CreateIncrementalBundle(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyBundleHash(bundle.Bytes, bundle.SHA256); err != nil {
		t.Fatalf("hash verification failed: %v", err)
	}
}

func TestTamperedBundleRejected(t *testing.T) {
	dir, _, _ := testRepo(t)
	bundle, err := CreateIncrementalBundle(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	tampered := append([]byte(nil), bundle.Bytes...)
	tampered[len(tampered)-1] ^= 0xff
	if err := VerifyBundleHash(tampered, bundle.SHA256); err == nil {
		t.Fatal("tampered bundle passed hash verification")
	}
}

func TestUntrackedFilesExcludedFromBundle(t *testing.T) {
	dir, _, _ := testRepo(t)
	if err := os.WriteFile(filepath.Join(dir, "untracked-secret.txt"), []byte("secret\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	bundle, err := CreateIncrementalBundle(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, commit := range bundle.Manifest.Commits {
		for _, file := range commit.Files {
			if file.Path == "untracked-secret.txt" {
				t.Fatal("untracked file was included in bundle")
			}
		}
	}
}

func TestSubmoduleDetection(t *testing.T) {
	dir, repo, _ := testRepo(t)
	submoduleHash := commitSubmodule(t, dir, repo, "vendor/lib")

	bundle, err := CreateIncrementalBundle(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Submodules) != 1 {
		t.Fatalf("submodules = %d, want 1", len(bundle.Submodules))
	}
	if bundle.Submodules[0].Path != "vendor/lib" {
		t.Fatalf("submodule path = %s, want vendor/lib", bundle.Submodules[0].Path)
	}
	if bundle.Submodules[0].Hash != submoduleHash.String() {
		t.Fatalf("submodule hash = %s, want %s", bundle.Submodules[0].Hash, submoduleHash.String())
	}
}

func TestSubmoduleContentsExcludedFromBundle(t *testing.T) {
	dir, repo, _ := testRepo(t)
	_ = commitSubmodule(t, dir, repo, "vendor/lib")

	bundle, err := CreateIncrementalBundle(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, commit := range bundle.Manifest.Commits {
		for _, file := range commit.Files {
			if file.Path == "vendor/lib/internal.txt" || file.Path == "vendor/lib" {
				t.Fatalf("submodule content path %q was included as a bundle file", file.Path)
			}
		}
	}
}

func commitSubmodule(t *testing.T, dir string, repo *gogit.Repository, path string) plumbing.Hash {
	t.Helper()
	gitmodules := "[submodule \"vendor/lib\"]\n\tpath = vendor/lib\n\turl = https://example.com/vendor/lib.git\n"
	if err := os.WriteFile(filepath.Join(dir, ".gitmodules"), []byte(gitmodules), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, path, "internal.txt"), []byte("submodule content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	worktree, err := repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := worktree.Add(".gitmodules"); err != nil {
		t.Fatal(err)
	}

	idx, err := repo.Storer.Index()
	if err != nil {
		t.Fatal(err)
	}
	submoduleHash := plumbing.NewHash("1111111111111111111111111111111111111111")
	entry := idx.Add(path)
	entry.Hash = submoduleHash
	entry.Mode = filemode.Submodule
	entry.CreatedAt = time.Unix(4, 0)
	entry.ModifiedAt = time.Unix(4, 0)
	entry.Stage = index.Merged
	if err := repo.Storer.SetIndex(idx); err != nil {
		t.Fatal(err)
	}

	_, err = worktree.Commit("add submodule", &gogit.CommitOptions{
		Author: &object.Signature{Name: "gitfuse", Email: "test@gitfuse.dev", When: time.Unix(4, 0)},
	})
	if err != nil {
		t.Fatal(err)
	}
	return submoduleHash
}
