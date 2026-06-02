package git

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type FileFingerprint struct {
	Path string
	Hash string
}

func FingerprintCommittedLikeTree(root string) ([]FileFingerprint, error) {
	var fingerprints []FileFingerprint
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if rel == ".git" || strings.HasPrefix(rel, ".git"+string(filepath.Separator)) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		sum := sha256.New()
		if _, err := io.Copy(sum, file); err != nil {
			return err
		}
		fingerprints = append(fingerprints, FileFingerprint{
			Path: filepath.ToSlash(rel),
			Hash: hex.EncodeToString(sum.Sum(nil)),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("fingerprint tree: %w", err)
	}
	sort.Slice(fingerprints, func(i, j int) bool { return fingerprints[i].Path < fingerprints[j].Path })
	return fingerprints, nil
}
