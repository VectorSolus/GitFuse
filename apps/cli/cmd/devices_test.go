package cmd

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestDevicesRevokeRejectsMalformedIDLocally(t *testing.T) {
	cases := []struct {
		name string
		id   string
		want string
	}{
		{
			name: "malformed",
			id:   "definitely-not-a-real-device-id",
			want: "invalid device id: definitely-not-a-real-device-id",
		},
		{
			name: "blank",
			id:   "   ",
			want: "invalid device id: ",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}))
			defer server.Close()

			t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
			t.Setenv("GITFUSE_RELAY_URL", server.URL)
			t.Setenv("GITFUSE_TEST_TOKEN", "test-token")

			output, err := executeRootCommand(t, "devices", "revoke", tc.id)
			if err == nil {
				t.Fatal("devices revoke succeeded with malformed device id")
			}
			if err.Error() != tc.want {
				t.Fatalf("err = %q, want %q", err.Error(), tc.want)
			}
			if strings.Contains(output+err.Error(), "500") || strings.Contains(output+err.Error(), "Internal Server Error") {
				t.Fatalf("malformed id exposed raw relay failure: output=%q err=%q", output, err)
			}
			if requests != 0 {
				t.Fatalf("relay received %d requests for malformed id", requests)
			}
		})
	}
}

func TestDevicesRevokeValidLookingIDUsesRelayDelete(t *testing.T) {
	const deviceID = "00000000-0000-4000-8000-000000000123"

	requests := 0
	var gotMethod string
	var gotPath string
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("authorization")
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"revoked":true}`))
	}))
	defer server.Close()

	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	t.Setenv("GITFUSE_RELAY_URL", server.URL)
	t.Setenv("GITFUSE_TEST_TOKEN", "test-token")

	output, err := executeRootCommand(t, "devices", "revoke", deviceID)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 1 {
		t.Fatalf("relay received %d requests, want 1", requests)
	}
	if gotMethod != http.MethodDelete {
		t.Fatalf("method = %q, want %q", gotMethod, http.MethodDelete)
	}
	if gotPath != "/v1/devices/"+deviceID {
		t.Fatalf("path = %q, want %q", gotPath, "/v1/devices/"+deviceID)
	}
	if gotAuth != "Bearer test-token" {
		t.Fatalf("authorization = %q", gotAuth)
	}
	if !strings.Contains(output, "Revoked device "+deviceID+".") {
		t.Fatalf("output = %q", output)
	}
}
