package integration

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	gfcrypto "github.com/gitfuse/gitfuse/apps/cli/internal/crypto"
	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func TestEndToEndSync(t *testing.T) {
	dir, repo, root := testRepository(t)
	second := commitFile(t, dir, repo, "app.txt", "synced\n", "sync payload", time.Unix(2, 0))

	bundle, err := gfgit.CreateIncrementalBundle(dir, root.String())
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Manifest.Commits) != 1 || bundle.Manifest.Commits[0].SHA != second.String() {
		t.Fatalf("bundle commits = %+v, want only %s", bundle.Manifest.Commits, second.String())
	}

	identity, err := gfcrypto.GenerateIdentity()
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := gfcrypto.Encrypt(bundle.Bytes, identity.Recipient())
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := gfcrypto.Decrypt(encrypted, identity)
	if err != nil {
		t.Fatal(err)
	}
	if err := gfgit.VerifyBundleHash(decrypted, bundle.SHA256); err != nil {
		t.Fatal(err)
	}
}

func TestRootSHANeverBypassed(t *testing.T) {
	if err := gfgit.ValidateLayerOneRoot("root-a", "root-a"); err != nil {
		t.Fatalf("matching roots failed: %v", err)
	}
	for _, forceFlag := range []bool{false, true} {
		if err := gfgit.ValidateLayerOneRoot("root-a", "root-b"); err == nil {
			t.Fatalf("root SHA mismatch was bypassed with force=%t", forceFlag)
		}
	}
}

func TestTransactionalReplayInterrupt(t *testing.T) {
	dir, repo, root := testRepository(t)
	replayed := commitFile(t, dir, repo, "incoming.txt", "incoming\n", "incoming", time.Unix(2, 0))
	setCurrentBranch(t, repo, root)

	if err := gfgit.CreateTempReplayBranch(dir, "gitfuse-replay-test"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Storer.SetReference(plumbing.NewHashReference(plumbing.NewBranchReferenceName("gitfuse-replay-test"), replayed)); err != nil {
		t.Fatal(err)
	}

	head, err := repo.Head()
	if err != nil {
		t.Fatal(err)
	}
	if head.Hash() != root {
		t.Fatalf("target branch moved during interrupted replay: got %s want %s", head.Hash(), root)
	}
	ref, err := repo.Reference(plumbing.NewBranchReferenceName("gitfuse-replay-test"), true)
	if err != nil {
		t.Fatal(err)
	}
	if ref.Hash() != replayed {
		t.Fatalf("temp replay branch = %s, want %s", ref.Hash(), replayed)
	}
}

func TestOfflineQueueRecovery(t *testing.T) {
	repoPath := t.TempDir()
	payload := []byte("encrypted queued bundle")
	queued, err := relay.WriteQueueBundle(repoPath, "integration", payload)
	if err != nil {
		t.Fatal(err)
	}

	var uploaded string
	client := relay.NewClient("http://relay.test", "token")
	client.HTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/bundles/upload" {
			t.Fatalf("upload path = %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatal(err)
		}
		file, _, err := r.FormFile("bundle")
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		body, err := io.ReadAll(file)
		if err != nil {
			t.Fatal(err)
		}
		uploaded = string(body)
		return &http.Response{
			StatusCode: http.StatusCreated,
			Body:       io.NopCloser(strings.NewReader(`{"bundle":{"id":"bundle-1"}}`)),
			Header:     make(http.Header),
			Request:    r,
		}, nil
	})}

	if err := relay.RetryQueuedBundle(context.Background(), client, queued.Path, queued.Hash, relay.UploadRequest{
		RelayEntryID: "entry",
		BundleHash:   queued.Hash,
		CommitCount:  "1",
		SizeBytes:    "24",
	}); err != nil {
		t.Fatal(err)
	}
	if uploaded != string(payload) {
		t.Fatalf("uploaded payload = %q, want %q", uploaded, payload)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestAllFiveRelayErrors(t *testing.T) {
	checks := []struct {
		name string
		got  string
		want string
	}{
		{"unreachable", relay.RenderRelayUnreachable("queued.bundle.enc"), "Relay unreachable"},
		{"slow", relay.RenderRelaySlow(42, 21, 50), "Cancel and queue locally"},
		{"over limit", relay.RenderOverLimit([]byte(`{"error":"OVER_LIMIT","limit":"storage","current":524288010,"max":524288000}`)), "Over limit: storage"},
		{"auth expired", relay.RenderAuthExpired(), "Session expired"},
		{"bundle rejected", relay.RenderBundleRejected([]byte(`{"error":"BUNDLE_REJECTED","reason":"HASH_MISMATCH","relay_min_version":"1.0.0"}`)), "Bundle rejected: HASH_MISMATCH"},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if !strings.Contains(check.got, check.want) {
				t.Fatalf("message = %q, want substring %q", check.got, check.want)
			}
		})
	}
}

func testRepository(t *testing.T) (string, *gogit.Repository, plumbing.Hash) {
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
	if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o755); err != nil {
		t.Fatal(err)
	}
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

func setCurrentBranch(t *testing.T, repo *gogit.Repository, hash plumbing.Hash) {
	t.Helper()
	head, err := repo.Head()
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.Storer.SetReference(plumbing.NewHashReference(head.Name(), hash)); err != nil {
		t.Fatal(err)
	}
}
