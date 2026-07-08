package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gogit "github.com/go-git/go-git/v5"
	"github.com/spf13/cobra"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Inspect gitfuse CLI, config, relay, and repository status",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDoctor(cmd.Context(), cmd)
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}

type doctorReport struct {
	hasFailure bool
}

func (report *doctorReport) line(cmd *cobra.Command, status, label, detail string) {
	if status == "FAIL" {
		report.hasFailure = true
	}
	if detail == "" {
		fmt.Fprintf(cmd.OutOrStdout(), "%s %s\n", status, label)
		return
	}
	fmt.Fprintf(cmd.OutOrStdout(), "%s %s: %s\n", status, label, detail)
}

func runDoctor(ctx context.Context, cmd *cobra.Command) error {
	report := &doctorReport{}

	report.line(
		cmd,
		"PASS",
		"CLI version",
		fmt.Sprintf("gitfuse %s commit %s built %s", currentCLIVersion(), commitOrUnknown(), buildDateOrUnknown()),
	)
	executable, err := os.Executable()
	if err != nil {
		report.line(cmd, "WARN", "Executable path", err.Error())
	} else {
		report.line(cmd, "PASS", "Executable path", executable)
		name := filepath.Base(executable)
		if found, err := exec.LookPath(name); err == nil {
			report.line(cmd, "PASS", "PATH lookup", found)
		} else {
			report.line(cmd, "WARN", "PATH lookup", fmt.Sprintf("%s is not reachable from PATH", name))
		}
	}

	configDir, err := config.GlobalDir()
	if err != nil {
		report.line(cmd, "FAIL", "Config directory", err.Error())
	} else {
		detail := configDir
		if info, err := os.Stat(configDir); err == nil && info.IsDir() {
			detail += " (exists)"
		} else if err != nil && os.IsNotExist(err) {
			detail += " (not created)"
		} else if err != nil {
			detail += fmt.Sprintf(" (%s)", err)
		}
		report.line(cmd, "PASS", "Config directory", detail)
	}

	credentials, err := config.ReadCredentials()
	switch {
	case err == nil && credentials.Token != "":
		report.line(cmd, "PASS", "Credentials", "valid credential file found")
	case err != nil && os.IsNotExist(err):
		report.line(cmd, "WARN", "Credentials", "not authenticated")
	default:
		report.line(cmd, "WARN", "Credentials", "not authenticated")
	}

	resolvedRelay, err := resolveRelayURL()
	if err != nil {
		report.line(cmd, "FAIL", "Relay URL", err.Error())
	} else {
		report.line(cmd, "PASS", "Relay URL", fmt.Sprintf("%s (%s)", resolvedRelay.URL, resolvedRelay.Source))
		reportRelayHealth(ctx, cmd, report, resolvedRelay)
	}

	report.line(cmd, "PASS", "Platform", fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH))
	reportRepositoryStatus(cmd, report)

	if report.hasFailure {
		return fmt.Errorf("gitfuse doctor reported failures")
	}
	return nil
}

func reportRelayHealth(ctx context.Context, cmd *cobra.Command, report *doctorReport, resolved resolvedRelayURL) {
	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(checkCtx, http.MethodGet, resolved.URL+"/health", nil)
	if err != nil {
		report.line(cmd, "FAIL", "Relay health", err.Error())
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		status := "FAIL"
		if resolved.Source == relayURLSourceDevelopment {
			status = "WARN"
		}
		report.line(cmd, status, "Relay health", err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		report.line(cmd, "PASS", "Relay health", fmt.Sprintf("HTTP %d", resp.StatusCode))
		return
	}
	report.line(cmd, "FAIL", "Relay health", fmt.Sprintf("HTTP %d", resp.StatusCode))
}

func reportRepositoryStatus(cmd *cobra.Command, report *doctorReport) {
	wd, err := os.Getwd()
	if err != nil {
		report.line(cmd, "WARN", "Git repository", err.Error())
		return
	}
	if _, err := gogit.PlainOpenWithOptions(wd, &gogit.PlainOpenOptions{DetectDotGit: true}); err != nil {
		report.line(cmd, "WARN", "Git repository", "not detected")
		return
	}
	report.line(cmd, "PASS", "Git repository", wd)

	localDir := config.GitfuseDir(wd)
	if info, err := os.Stat(localDir); err == nil && info.IsDir() {
		report.line(cmd, "PASS", "Repository metadata", localDir)
	} else {
		report.line(cmd, "WARN", "Repository metadata", ".gitfuse not found")
	}

	if localCfg, err := config.ReadLocalConfig(wd); err == nil {
		report.line(
			cmd,
			"PASS",
			"Repository relay entry",
			fmt.Sprintf("%s (%s)", localCfg.DisplayName, localCfg.RelayEntryID),
		)
	}
}
