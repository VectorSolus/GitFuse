package relay

import (
	"strings"
	"testing"
)

func TestRelaySlowPrompt(t *testing.T) {
	got := RenderRelaySlow(42, 21, 50)
	for _, want := range []string{
		"⚠ Relay is responding slowly.",
		"Upload progress: 42% (21 MB / 50 MB)",
		"[C] Cancel and queue locally   [W] Keep waiting",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("slow prompt missing %q in %q", want, got)
		}
	}
}

func TestAllFiveRelayFailureModes(t *testing.T) {
	cases := []struct {
		name string
		got  string
		want string
	}{
		{
			name: "unreachable",
			got:  RenderRelayUnreachable("queued.bundle.enc"),
			want: "✗ Relay unreachable.",
		},
		{
			name: "slow",
			got:  RenderRelaySlow(10, 1, 10),
			want: "⚠ Relay is responding slowly.",
		},
		{
			name: "over limit",
			got:  RenderOverLimit([]byte(`{"error":"OVER_LIMIT","limit":"repos","current":6,"max":5}`)),
			want: "Over limit: repos",
		},
		{
			name: "auth expired",
			got:  RenderAuthExpired(),
			want: "Your local changes are safe — nothing was lost.",
		},
		{
			name: "bundle rejected",
			got:  RenderBundleRejected([]byte(`{"error":"BUNDLE_REJECTED","reason":"HASH_MISMATCH","relay_min_version":"1.0.0"}`)),
			want: "Bundle rejected: HASH_MISMATCH.",
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if !strings.Contains(tt.got, tt.want) {
				t.Fatalf("message = %q, want substring %q", tt.got, tt.want)
			}
		})
	}
}
