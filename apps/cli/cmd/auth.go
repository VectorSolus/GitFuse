package cmd

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	gfcrypto "github.com/gitfuse/gitfuse/apps/cli/internal/crypto"
	"github.com/spf13/cobra"
)

type authOptions struct {
	headless bool
	code     string
}

var authOpts authOptions

var authCmd = &cobra.Command{
	Use:     "auth",
	Short:   "Authenticate this device with gitfuse",
	Example: "  gitfuse auth login\n  gitfuse auth login --headless\n  gitfuse auth",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuth(cmd.Context(), cmd, authOpts)
	},
}

var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate this device with gitfuse",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuth(cmd.Context(), cmd, authOpts)
	},
}

func init() {
	authCmd.PersistentFlags().BoolVar(&authOpts.headless, "headless", false, "print approval URL without opening a browser")
	authCmd.PersistentFlags().StringVar(&authOpts.code, "code", "", "fixed auth code for tests")
	_ = authCmd.PersistentFlags().MarkHidden("code")
	authCmd.AddCommand(authLoginCmd)
	rootCmd.AddCommand(authCmd)
}

func runAuth(ctx context.Context, cmd *cobra.Command, opts authOptions) error {
	if !opts.headless {
		reader := bufio.NewReader(cmd.InOrStdin())
		existing, err := promptLine(cmd, reader, "Do you already have a gitfuse account? (Y/N) ")
		if err != nil {
			return err
		}
		switch strings.ToLower(strings.TrimSpace(existing)) {
		case "n", "no":
			fmt.Fprintln(cmd.OutOrStdout(), "Create your gitfuse account at https://gitfuse.dev/signup, then run gitfuse auth again.")
			return nil
		case "y", "yes":
		default:
			return fmt.Errorf("enter Y or N")
		}

		method, err := promptLine(cmd, reader, "Sign in method (Email/GitHub/Google): ")
		if err != nil {
			return err
		}
		switch strings.ToLower(strings.TrimSpace(method)) {
		case "email":
			return fmt.Errorf("email/password CLI auth is not available because the relay has no existing credentials token route; use GitHub or Google OAuth for this version")
		case "github", "google":
			return runOAuthAuth(ctx, cmd, opts)
		default:
			return fmt.Errorf("choose Email, GitHub, or Google")
		}
	}

	return runOAuthAuth(ctx, cmd, opts)
}

func runOAuthAuth(ctx context.Context, cmd *cobra.Command, opts authOptions) error {
	code := opts.code
	var err error
	if code == "" {
		code, err = generateCode()
		if err != nil {
			return err
		}
	}

	resolvedRelay, err := resolveRelayURL()
	if err != nil {
		return err
	}
	relayURL := resolvedRelay.URL
	approvalBase := os.Getenv("GITFUSE_AUTH_URL")
	if approvalBase == "" {
		dashboardURL := strings.TrimRight(os.Getenv("GITFUSE_DASHBOARD_URL"), "/")
		if dashboardURL == "" {
			dashboardURL = "http://localhost:3000"
		}
		approvalBase = dashboardURL + "/cli-auth"
	}
	approvalBase = strings.TrimRight(approvalBase, "/")
	deviceName, _ := os.Hostname()
	if deviceName == "" {
		deviceName = "gitfuse-device"
	}
	deviceID, err := config.EnsureDeviceID()
	if err != nil {
		return err
	}

	if err := postJSON(ctx, relayURL+"/v1/auth/device", map[string]string{
		"code":       code,
		"deviceName": deviceName,
		"deviceId":   deviceID,
	}, nil); err != nil {
		return err
	}

	approvalURL := fmt.Sprintf("%s?code=%s", approvalBase, code)
	if opts.headless {
		fmt.Fprintf(cmd.OutOrStdout(), "Copy this URL to any browser:\n  %s\nWaiting for approval...\n", approvalURL)
	} else {
		fmt.Fprintf(cmd.OutOrStdout(), "Opening browser for approval:\n  %s\nWaiting for approval...\n", approvalURL)
	}

	pollInterval := durationFromEnv("GITFUSE_AUTH_POLL_INTERVAL", 2*time.Second)
	timeout := durationFromEnv("GITFUSE_AUTH_TIMEOUT", 10*time.Minute)
	deadline := time.Now().Add(timeout)
	for {
		if time.Now().After(deadline) {
			return fmt.Errorf("auth approval timed out after %s", timeout)
		}
		result, err := pollAuth(ctx, relayURL, code)
		if err != nil {
			return err
		}
		if result.Approved {
			key, err := gfcrypto.GenerateIdentityString()
			if err != nil {
				return err
			}
			if _, err := config.WriteCredentials(config.Credentials{
				Username:     result.Username,
				Token:        result.Token,
				DeviceID:     firstNonEmpty(result.DeviceID, deviceID),
				Key:          key,
				RegisteredAt: time.Now(),
			}); err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), "✓ Device authenticated.")
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func promptLine(cmd *cobra.Command, reader *bufio.Reader, prompt string) (string, error) {
	fmt.Fprint(cmd.OutOrStdout(), prompt)
	value, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(value), nil
}

type pollResponse struct {
	Approved bool   `json:"approved"`
	Token    string `json:"token"`
	Username string `json:"username"`
	DeviceID string `json:"deviceId"`
}

func pollAuth(ctx context.Context, relayURL, code string) (pollResponse, error) {
	var result pollResponse
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, relayURL+"/v1/auth/poll/"+code, nil)
	if err != nil {
		return result, err
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return result, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return result, fmt.Errorf("auth poll failed with status %d", response.StatusCode)
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return result, err
	}
	return result, nil
}

func postJSON(ctx context.Context, url string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("POST %s failed with status %d", url, response.StatusCode)
	}
	if out != nil {
		return json.NewDecoder(response.Body).Decode(out)
	}
	return nil
}

func generateCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	raw := make([]byte, 6)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate auth code: %w", err)
	}
	for i, b := range raw {
		raw[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(raw), nil
}

func durationFromEnv(name string, fallback time.Duration) time.Duration {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
