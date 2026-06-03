package relay

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type QueuedBundle struct {
	Path    string
	Hash    string
	Size    int64
	Retries int
}

func QueueDir(repoPath string) string {
	return filepath.Join(repoPath, ".gitfuse", "queue")
}

func WriteQueueBundle(repoPath, id string, payload []byte) (QueuedBundle, error) {
	dir := QueueDir(repoPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return QueuedBundle{}, fmt.Errorf("create queue directory: %w", err)
	}
	name := fmt.Sprintf("%d-%s.bundle.enc", time.Now().UnixNano(), id)
	finalPath := filepath.Join(dir, name)
	tmpPath := finalPath + ".tmp"
	if err := os.WriteFile(tmpPath, payload, 0o600); err != nil {
		return QueuedBundle{}, fmt.Errorf("write queue temp bundle: %w", err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return QueuedBundle{}, fmt.Errorf("commit queue bundle: %w", err)
	}
	info, err := os.Stat(finalPath)
	if err != nil {
		return QueuedBundle{}, fmt.Errorf("stat queued bundle: %w", err)
	}
	return QueuedBundle{Path: finalPath, Hash: SHA256(payload), Size: info.Size()}, nil
}

func ReadQueueBundle(path, expectedHash string) ([]byte, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read queued bundle: %w", err)
	}
	if actual := SHA256(payload); actual != expectedHash {
		return nil, fmt.Errorf("queued bundle hash mismatch: expected %s actual %s", expectedHash, actual)
	}
	return payload, nil
}

func SHA256(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
