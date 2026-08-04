package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/spf13/cobra"
)

func TestDashboardBaseURLDefaultsToProduction(t *testing.T) {
	t.Setenv("GITFUSE_DASHBOARD_URL", "")

	if got := dashboardBaseURL(); got != "https://gitfuse.dev" {
		t.Fatalf("dashboardBaseURL() = %q, want https://gitfuse.dev", got)
	}
}

func TestDashboardBaseURLSupportsLocalOverride(t *testing.T) {
	t.Setenv("GITFUSE_DASHBOARD_URL", "http://localhost:3000/")

	if got := dashboardBaseURL(); got != "http://localhost:3000" {
		t.Fatalf("dashboardBaseURL() = %q, want http://localhost:3000", got)
	}
}

func TestDashboardEndpointJoinsCliPairToProductionDefault(t *testing.T) {
	t.Setenv("GITFUSE_DASHBOARD_URL", "")

	got := dashboardEndpoint("/api/auth/cli-pair")
	if got != "https://gitfuse.dev/api/auth/cli-pair" {
		t.Fatalf("dashboardEndpoint(cli-pair) = %q", got)
	}
}

func TestDashboardAuthPathsDoNotDefaultToLocalhost(t *testing.T) {
	t.Setenv("GITFUSE_AUTH_URL", "")
	t.Setenv("GITFUSE_DASHBOARD_URL", "")

	for _, got := range []string{
		dashboardEndpoint("/api/auth/cli-pair"),
		dashboardEndpoint("/api/auth/cli-otp/request"),
		dashboardEndpoint("/api/auth/cli-otp/verify"),
		authApprovalBaseURL(),
	} {
		if strings.Contains(got, "localhost:3000") {
			t.Fatalf("auth URL defaulted to localhost: %q", got)
		}
	}
}

func TestAuthApprovalBaseURLPrecedence(t *testing.T) {
	t.Setenv("GITFUSE_DASHBOARD_URL", "http://localhost:3000/")
	t.Setenv("GITFUSE_AUTH_URL", "https://auth.example.test/cli-auth/")

	if got := authApprovalBaseURL(); got != "https://auth.example.test/cli-auth" {
		t.Fatalf("authApprovalBaseURL() = %q, want GITFUSE_AUTH_URL override", got)
	}
	if got := dashboardEndpoint("/api/auth/cli-pair"); got != "http://localhost:3000/api/auth/cli-pair" {
		t.Fatalf("dashboardEndpoint(cli-pair) = %q, want GITFUSE_DASHBOARD_URL override", got)
	}
}

func TestAuthApprovalBaseURLUsesDashboardDefault(t *testing.T) {
	t.Setenv("GITFUSE_AUTH_URL", "")
	t.Setenv("GITFUSE_DASHBOARD_URL", "")

	if got := authApprovalBaseURL(); got != "https://gitfuse.dev/cli-auth" {
		t.Fatalf("authApprovalBaseURL() = %q, want production dashboard auth URL", got)
	}
}

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

func TestAuthWhoamiUnauthenticatedFailsCleanly(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))

	_, err := executeRootCommand(t, "auth", "whoami")
	if err == nil {
		t.Fatal("auth whoami succeeded without credentials")
	}
	if err.Error() != notAuthenticatedMessage {
		t.Fatalf("err = %q, want %q", err.Error(), notAuthenticatedMessage)
	}
}

func TestAuthLogoutUnauthenticatedIsFriendly(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))

	output, err := executeRootCommand(t, "auth", "logout")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output, "Already logged out. No local GitFuse session found.") {
		t.Fatalf("logout output = %q", output)
	}
}

func TestAuthWhoamiAndLogoutUseLocalCredentialsOnly(t *testing.T) {
	t.Setenv("GITFUSE_CONFIG_DIR", filepath.Join(t.TempDir(), "config"))
	if err := config.WriteDeviceID("device-keep"); err != nil {
		t.Fatal(err)
	}
	if _, err := config.WriteCredentials(config.Credentials{
		Username:     "cli-user",
		Token:        "gf_cli_token",
		DeviceID:     "device-keep",
		Key:          "secret-key",
		RegisteredAt: time.Unix(1_700_000_000, 0),
	}); err != nil {
		t.Fatal(err)
	}

	whoami, err := executeRootCommand(t, "auth", "whoami")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Account: cli-user", "Device ID: device-keep", "Authenticated at:"} {
		if !strings.Contains(whoami, want) {
			t.Fatalf("whoami output missing %q:\n%s", want, whoami)
		}
	}

	logout, err := executeRootCommand(t, "auth", "logout")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(logout, "Relay trusted device was not revoked.") {
		t.Fatalf("logout output = %q", logout)
	}
	if _, err := config.ReadCredentials(); !os.IsNotExist(err) {
		t.Fatalf("credentials still readable after logout: err=%v", err)
	}
	deviceID, err := config.ReadDeviceID()
	if err != nil {
		t.Fatal(err)
	}
	if deviceID != "device-keep" {
		t.Fatalf("device id = %q, want preserved device id", deviceID)
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
