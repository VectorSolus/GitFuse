package cmd

import (
	"strings"
	"testing"
)

func TestRenderAccountLimitsShowsPaidRetention(t *testing.T) {
	retentionDays := 365
	limits := accountLimitsResponse{
		Tier: "paid",
	}
	limits.Devices.Current = 3
	limits.RetentionDays = &retentionDays

	output := renderAccountLimits(limits)

	if !strings.Contains(output, "Devices: 3 / ∞") {
		t.Fatalf("output = %q, want unlimited paid devices", output)
	}
	if !strings.Contains(output, "Retention: 365 days") {
		t.Fatalf("output = %q, want paid retention days", output)
	}
}
