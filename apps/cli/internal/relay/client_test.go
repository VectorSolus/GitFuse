package relay

import (
	"context"
	"net/http"
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

func TestUploadBundleRejectsInvalidRequestBeforeNetwork(t *testing.T) {
	calls := 0
	client := NewClient("http://relay.test", "token")
	client.HTTPClient = &http.Client{Transport: relayRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, nil
	})}

	_, err := client.UploadBundle(context.Background(), UploadRequest{
		RelayEntryID: "relay-entry",
		BundleHash:   "hash",
		CommitCount:  "0",
		SizeBytes:    "123",
		Payload:      []byte("bundle"),
	})
	if err == nil {
		t.Fatal("UploadBundle accepted invalid commitCount")
	}
	if !strings.Contains(err.Error(), "commitCount must be greater than zero") {
		t.Fatalf("error = %q, want commitCount validation", err.Error())
	}
	if calls != 0 {
		t.Fatalf("network calls = %d, want 0", calls)
	}
}

func TestUploadOrQueueRejectsInvalidRequestWithoutQueueing(t *testing.T) {
	repoPath := t.TempDir()
	client := NewClient("http://relay.test", "token")

	queued, message, err := UploadOrQueue(context.Background(), client, repoPath, UploadRequest{
		RelayEntryID: "relay-entry",
		BundleHash:   "hash",
		CommitCount:  "1",
		SizeBytes:    "0",
		Payload:      []byte("bundle"),
	})
	if err == nil {
		t.Fatal("UploadOrQueue accepted invalid sizeBytes")
	}
	if queued.Path != "" {
		t.Fatalf("queued path = %q, want none", queued.Path)
	}
	if message != "" {
		t.Fatalf("message = %q, want empty", message)
	}
	if !strings.Contains(err.Error(), "sizeBytes must be greater than zero") {
		t.Fatalf("error = %q, want sizeBytes validation", err.Error())
	}
}

type relayRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn relayRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}
