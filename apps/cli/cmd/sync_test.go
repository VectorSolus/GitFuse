package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	gfgit "github.com/gitfuse/gitfuse/apps/cli/internal/git"
	"github.com/gitfuse/gitfuse/apps/cli/internal/workspace"
	"github.com/spf13/cobra"
)

func TestSubmoduleWarningPrintedOnce(t *testing.T) {
	repoPath := t.TempDir()
	if _, err := workspace.WriteLedger(repoPath, workspace.Ledger{}); err != nil {
		t.Fatal(err)
	}
	submodules := []gfgit.BundleSubmodule{{Path: "vendor/lib", Hash: strings.Repeat("1", 40)}}

	submoduleWarningPrinted = false
	var first bytes.Buffer
	firstCmd := &cobra.Command{}
	firstCmd.SetOut(&first)
	ledger, err := workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := printSubmoduleWarningOnce(firstCmd, repoPath, submodules, &ledger); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(first.String(), "Submodules detected at vendor/lib") {
		t.Fatalf("first warning output = %q", first.String())
	}
	if _, err := workspace.ReadLedger(repoPath); err != nil {
		t.Fatal(err)
	}
	ledgerPath := filepath.Join(repoPath, ".gitfuse", "ledger")
	if !strings.Contains(readFile(t, ledgerPath), "submodule_warning_shown = true") {
		t.Fatal("ledger did not persist submodule warning marker")
	}

	submoduleWarningPrinted = false
	var second bytes.Buffer
	secondCmd := &cobra.Command{}
	secondCmd.SetOut(&second)
	ledger, err = workspace.ReadLedger(repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := printSubmoduleWarningOnce(secondCmd, repoPath, submodules, &ledger); err != nil {
		t.Fatal(err)
	}
	if second.String() != "" {
		t.Fatalf("second warning output = %q, want empty", second.String())
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}
