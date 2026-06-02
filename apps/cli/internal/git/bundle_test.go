package git

import (
	"os"
	"path/filepath"
	"testing"
	"time"
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
