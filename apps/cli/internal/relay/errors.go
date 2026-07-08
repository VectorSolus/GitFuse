package relay

import (
	"encoding/json"
	"fmt"
)

type FailureMode string

const (
	RelayUnreachable FailureMode = "RELAY_UNREACHABLE"
	RelaySlow        FailureMode = "RELAY_SLOW"
	OverLimit        FailureMode = "OVER_LIMIT"
	AuthExpired      FailureMode = "AUTH_EXPIRED"
	BundleRejected   FailureMode = "BUNDLE_REJECTED"
)

type OverLimitError struct {
	Error   string `json:"error"`
	Limit   string `json:"limit"`
	Current int    `json:"current"`
	Max     int    `json:"max"`
}

type BundleRejectedError struct {
	Error           string `json:"error"`
	Reason          string `json:"reason"`
	RelayMinVersion string `json:"relay_min_version"`
}

func RenderRelayUnreachable(filename string) string {
	return fmt.Sprintf("✗ Relay unreachable.\n  Bundle saved locally: .gitfuse/queue/%s\n\n  Will retry automatically when connection is restored.\n  Run 'gitfuse status' to see pending queue.", filename)
}

func RenderRelaySlow(percent int, uploadedMB, totalMB int) string {
	return fmt.Sprintf("⚠ Relay is responding slowly.\n  Upload progress: %d%% (%d MB / %d MB)\n\n  [C] Cancel and queue locally   [W] Keep waiting", percent, uploadedMB, totalMB)
}

func RenderOverLimit(raw []byte) string {
	var payload OverLimitError
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "✗ Relay limit exceeded.\n  Run 'gitfuse status' to inspect account usage.\n  Upgrade your plan from the dashboard."
	}
	return fmt.Sprintf("✗ Over limit: %s.\n  Current: %d\n  Maximum: %d\n  Next steps:\n  1. Run 'gitfuse status --all' to inspect usage.\n  2. Upgrade your plan or remove unused repos/devices/bundles.", payload.Limit, payload.Current, payload.Max)
}

func RenderAuthExpired() string {
	return "✗ Session expired.\n  Run 'gitfuse auth login' to re-authenticate.\n  Your local changes are safe — nothing was lost."
}

func RenderBundleRejected(raw []byte) string {
	var payload BundleRejectedError
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "✗ Bundle rejected.\n  Run 'gitfuse update' and retry.\n  Bundle preserved locally."
	}
	return fmt.Sprintf("✗ Bundle rejected: %s.\n  Run 'gitfuse update' to install relay-compatible version %s or newer.\n  Bundle preserved locally.", payload.Reason, payload.RelayMinVersion)
}
