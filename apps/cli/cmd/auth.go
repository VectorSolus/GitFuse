package cmd

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
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
	Use:   "auth",
	Short: "Authenticate this device with gitfuse",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuth(cmd.Context(), cmd, authOpts)
	},
}

func init() {
	authCmd.Flags().BoolVar(&authOpts.headless, "headless", false, "print approval URL without opening a browser")
	authCmd.Flags().StringVar(&authOpts.code, "code", "", "fixed auth code for tests")
	_ = authCmd.Flags().MarkHidden("code")
	rootCmd.AddCommand(authCmd)
}

func runAuth(ctx context.Context, cmd *cobra.Command, opts authOptions) error {
	code := opts.code
	var err error
	if code == "" {
		code, err = generateCode()
		if err != nil {
			return err
		}
	}

	relayURL := os.Getenv("GITFUSE_RELAY_URL")
	if relayURL == "" {
		relayURL = "http://localhost:8787"
	}
	approvalBase := os.Getenv("GITFUSE_AUTH_URL")
	if approvalBase == "" {
		approvalBase = "https://gitfuse.dev/cli-auth"
	}
	deviceName, _ := os.Hostname()
	if deviceName == "" {
		deviceName = "gitfuse-device"
	}

	if err := postJSON(ctx, relayURL+"/v1/auth/device", map[string]string{"code": code, "deviceName": deviceName}, nil); err != nil {
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

type pollResponse struct {
	Approved bool   `json:"approved"`
	Token    string `json:"token"`
	Username string `json:"username"`
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
