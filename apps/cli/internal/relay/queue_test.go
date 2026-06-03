package relay

import (
	"os"
	"path/filepath"
	"testing"
)

func TestQueueFallback(t *testing.T) {
	repoPath := filepath.Join("/tmp", "gitfuse-task009")
	_ = os.RemoveAll(repoPath)
	queued, err := WriteQueueBundle(repoPath, "offline", []byte("encrypted bundle"))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(queued.Path) != QueueDir(repoPath) {
		t.Fatalf("queue path = %s, want under %s", queued.Path, QueueDir(repoPath))
	}
	if filepath.Ext(queued.Path) != ".enc" {
		t.Fatalf("queued extension = %s, want .enc", filepath.Ext(queued.Path))
	}
	if _, err := os.Stat(queued.Path + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("temp queue file remained after atomic rename")
	}
}

func TestRetryOnReconnect(t *testing.T) {
	repoPath := t.TempDir()
	payload := []byte("queued encrypted bundle")
	queued, err := WriteQueueBundle(repoPath, "retry", payload)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ReadQueueBundle(queued.Path, queued.Hash)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatalf("queued payload = %q, want %q", got, payload)
	}
	if _, err := ReadQueueBundle(queued.Path, SHA256([]byte("wrong"))); err == nil {
		t.Fatal("hash mismatch was not rejected")
	}
}
