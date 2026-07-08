package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

func TestAuthEmailOTPFallbackStoresCredentialsWithoutBrowser(t *testing.T) {
	var otpRequested bool
	var otpVerified bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch r.URL.Path {
		case "/api/auth/cli-pair":
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":            "invalid_credentials",
				"suggest_fallback": true,
			})
		case "/api/auth/cli-otp/request":
			otpRequested = true
			_ = json.NewEncoder(w).Encode(map[string]any{"sent": true})
		case "/api/auth/cli-otp/verify":
			otpVerified = true
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["email"] != "cli@example.com" || body["code"] != "123456" {
				t.Fatalf("verify body = %#v", body)
			}
			_ = json.NewEncoder(w).Encode(map[string]string{
				"token":    "gf_cli_otp_token",
				"username": "cli-user",
				"deviceId": body["deviceId"],
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	t.Setenv("GITFUSE_DASHBOARD_URL", server.URL)
	t.Setenv("GITFUSE_CONFIG_DIR", t.TempDir())

	cmd := &cobra.Command{}
	cmd.SetIn(strings.NewReader("Y\ncli@example.com\nWrong123\n1\n123456\n"))
	var out bytes.Buffer
	cmd.SetOut(&out)

	if err := runAuth(context.Background(), cmd, authOptions{}); err != nil {
		t.Fatal(err)
	}

	output := out.String()
	if !strings.Contains(output, "Too many incorrect attempts. Let's verify a different way:") {
		t.Fatalf("output did not show fallback menu: %q", output)
	}
	if strings.Contains(output, "Opening browser for approval") {
		t.Fatalf("email OTP fallback opened browser flow: %q", output)
	}
	if !strings.Contains(output, "✓ Device authenticated.") {
		t.Fatalf("output did not confirm auth: %q", output)
	}
	if !otpRequested || !otpVerified {
		t.Fatalf("otpRequested=%v otpVerified=%v", otpRequested, otpVerified)
	}

	credentials, err := config.ReadCredentials()
	if err != nil {
		t.Fatal(err)
	}
	if credentials.Token != "gf_cli_otp_token" || credentials.Username != "cli-user" {
		t.Fatalf("credentials = %#v", credentials)
	}
	if _, err := os.Stat(mustCredentialsPath(t)); err != nil {
		t.Fatal(err)
	}
}

func mustCredentialsPath(t *testing.T) string {
	t.Helper()
	path, err := config.CredentialsPath()
	if err != nil {
		t.Fatal(err)
	}
	return path
}
