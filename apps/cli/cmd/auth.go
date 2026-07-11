package cmd

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
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
	oauth    bool
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

var authWhoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Print the current authenticated GitFuse identity",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuthWhoami(cmd)
	},
}

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove the local GitFuse session",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runAuthLogout(cmd)
	},
}

func init() {
	authCmd.PersistentFlags().BoolVar(&authOpts.headless, "headless", false, "print approval URL without opening a browser")
	authCmd.PersistentFlags().BoolVar(&authOpts.oauth, "oauth", false, "authenticate with the browser OAuth flow")
	authCmd.PersistentFlags().StringVar(&authOpts.code, "code", "", "fixed auth code for tests")
	_ = authCmd.PersistentFlags().MarkHidden("code")
	authCmd.AddCommand(authLoginCmd)
	authCmd.AddCommand(authWhoamiCmd)
	authCmd.AddCommand(authLogoutCmd)
	rootCmd.AddCommand(authCmd)
}

func runAuth(ctx context.Context, cmd *cobra.Command, opts authOptions) error {
	if opts.oauth || opts.headless {
		return runOAuthAuth(ctx, cmd, opts)
	}

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
		return runPairingPinAuth(ctx, cmd, reader, opts)
	default:
		return fmt.Errorf("enter Y or N")
	}
}

func runAuthWhoami(cmd *cobra.Command) error {
	credentials, err := config.ReadCredentials()
	if err != nil || strings.TrimSpace(credentials.Token) == "" {
		return fmt.Errorf(notAuthenticatedMessage)
	}
	username := credentials.Username
	if strings.TrimSpace(username) == "" {
		username = "unknown"
	}
	deviceID := credentials.DeviceID
	if strings.TrimSpace(deviceID) == "" {
		deviceID = "unknown"
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Account: %s\n", username)
	fmt.Fprintf(cmd.OutOrStdout(), "Device ID: %s\n", deviceID)
	if !credentials.RegisteredAt.IsZero() {
		fmt.Fprintf(cmd.OutOrStdout(), "Authenticated at: %s\n", credentials.RegisteredAt.UTC().Format(time.RFC3339))
	}
	return nil
}

func runAuthLogout(cmd *cobra.Command) error {
	credentials, err := config.ReadCredentials()
	if err != nil || strings.TrimSpace(credentials.Token) == "" {
		if removeErr := config.RemoveCredentials(); removeErr != nil {
			return removeErr
		}
		fmt.Fprintln(cmd.OutOrStdout(), "Already logged out. No local GitFuse session found.")
		return nil
	}
	if err := config.RemoveCredentials(); err != nil {
		return err
	}
	if strings.TrimSpace(credentials.DeviceID) != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Logged out locally from device %s. Relay trusted device was not revoked.\n", credentials.DeviceID)
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Logged out locally. Relay trusted device was not revoked.")
	return nil
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
	deviceID, err := currentDeviceID()
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
			if err := storeAuthCredentials(deviceAuthResponse{
				Token:    result.Token,
				Username: result.Username,
				DeviceID: firstNonEmpty(result.DeviceID, deviceID),
			}, relayURL); err != nil {
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

func runPairingPinAuth(ctx context.Context, cmd *cobra.Command, reader *bufio.Reader, opts authOptions) error {
	email, err := promptLine(cmd, reader, "Enter your account email: ")
	if err != nil {
		return err
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("email is required")
	}

	deviceName, deviceID, err := currentDeviceInfo()
	if err != nil {
		return err
	}

	for {
		pin, err := promptLine(cmd, reader, "Enter your Pairing PIN: ")
		if err != nil {
			return err
		}

		result, err := requestPairingPinAuth(ctx, email, pin, deviceName, deviceID)
		if err != nil {
			return err
		}
		if result.Token != "" {
			if err := storeAuthCredentials(result.authResponse(), dashboardRelayURL()); err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), "✓ Device authenticated.")
			return nil
		}
		if result.Error == "rate_limited" {
			return fmt.Errorf("too many attempts from this network. Try again in %d seconds", result.RetryAfterSeconds)
		}
		if result.SuggestFallback {
			fmt.Fprintln(cmd.OutOrStdout(), "Too many incorrect attempts. Let's verify a different way:")
			return runFallbackAuth(ctx, cmd, reader, email, opts)
		}
		fmt.Fprintln(cmd.OutOrStdout(), "Invalid email or PIN. Try again.")
	}
}

func runFallbackAuth(ctx context.Context, cmd *cobra.Command, reader *bufio.Reader, email string, opts authOptions) error {
	fmt.Fprintln(cmd.OutOrStdout(), "[1] Email OTP  [2] GitHub  [3] Google")
	choice, err := promptLine(cmd, reader, "Choose a method: ")
	if err != nil {
		return err
	}

	switch strings.TrimSpace(choice) {
	case "1":
		return runEmailOTPFallback(ctx, cmd, reader, email)
	case "2", "3":
		return runOAuthAuth(ctx, cmd, authOptions{headless: opts.headless})
	default:
		return fmt.Errorf("choose 1, 2, or 3")
	}
}

func runEmailOTPFallback(ctx context.Context, cmd *cobra.Command, reader *bufio.Reader, email string) error {
	if err := requestCliOTP(ctx, email); err != nil {
		return err
	}

	code, err := promptLine(cmd, reader, "Enter the code sent to your email: ")
	if err != nil {
		return err
	}
	deviceName, deviceID, err := currentDeviceInfo()
	if err != nil {
		return err
	}
	result, err := verifyCliOTP(ctx, email, code, deviceName, deviceID)
	if err != nil {
		return err
	}
	if err := storeAuthCredentials(result, dashboardRelayURL()); err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "✓ Device authenticated.")
	return nil
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

type deviceAuthResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	DeviceID string `json:"deviceId"`
}

type cliPairResponse struct {
	Token             string `json:"token"`
	Username          string `json:"username"`
	DeviceID          string `json:"deviceId"`
	Error             string `json:"error"`
	SuggestFallback   bool   `json:"suggest_fallback"`
	RetryAfterSeconds int    `json:"retry_after_seconds"`
}

func (result cliPairResponse) authResponse() deviceAuthResponse {
	return deviceAuthResponse{
		Token:    result.Token,
		Username: result.Username,
		DeviceID: result.DeviceID,
	}
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

func requestPairingPinAuth(ctx context.Context, email, pin, deviceName, deviceID string) (cliPairResponse, error) {
	var result cliPairResponse
	status, err := postDashboardJSON(ctx, "/api/auth/cli-pair", map[string]string{
		"email":      email,
		"pin":        pin,
		"deviceName": deviceName,
		"deviceId":   deviceID,
	}, &result)
	if err != nil {
		return result, err
	}
	if status >= 200 && status < 300 {
		if result.Token == "" {
			return result, fmt.Errorf("pairing succeeded without a device token")
		}
		return result, nil
	}
	if status == http.StatusUnauthorized && result.Error == "invalid_credentials" {
		return result, nil
	}
	if status == http.StatusTooManyRequests && result.Error == "rate_limited" {
		return result, nil
	}
	return result, fmt.Errorf("pairing auth failed with status %d", status)
}

func requestCliOTP(ctx context.Context, email string) error {
	var result struct {
		Sent  bool   `json:"sent"`
		Error string `json:"error"`
	}
	status, err := postDashboardJSON(ctx, "/api/auth/cli-otp/request", map[string]string{
		"email": email,
	}, &result)
	if err != nil {
		return err
	}
	if status >= 200 && status < 300 && result.Sent {
		return nil
	}
	if result.Error != "" {
		return fmt.Errorf("email OTP request failed: %s", result.Error)
	}
	return fmt.Errorf("email OTP request failed with status %d", status)
}

func verifyCliOTP(ctx context.Context, email, code, deviceName, deviceID string) (deviceAuthResponse, error) {
	var result struct {
		Token    string `json:"token"`
		Username string `json:"username"`
		DeviceID string `json:"deviceId"`
		Error    string `json:"error"`
	}
	status, err := postDashboardJSON(ctx, "/api/auth/cli-otp/verify", map[string]string{
		"email":      email,
		"code":       code,
		"deviceName": deviceName,
		"deviceId":   deviceID,
	}, &result)
	if err != nil {
		return deviceAuthResponse{}, err
	}
	if status >= 200 && status < 300 && result.Token != "" {
		return deviceAuthResponse{
			Token:    result.Token,
			Username: result.Username,
			DeviceID: result.DeviceID,
		}, nil
	}
	if result.Error != "" {
		return deviceAuthResponse{}, fmt.Errorf("email OTP verification failed: %s", result.Error)
	}
	return deviceAuthResponse{}, fmt.Errorf("email OTP verification failed with status %d", status)
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

func postDashboardJSON(ctx context.Context, path string, payload any, out any) (int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dashboardBaseURL()+path, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("content-type", "application/json")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if len(responseBody) > 0 && out != nil {
		if err := json.Unmarshal(responseBody, out); err != nil {
			return response.StatusCode, err
		}
	}
	return response.StatusCode, nil
}

func dashboardBaseURL() string {
	if base := os.Getenv("GITFUSE_DASHBOARD_URL"); base != "" {
		return strings.TrimRight(base, "/")
	}
	return "http://localhost:3000"
}

func currentDeviceInfo() (string, string, error) {
	deviceName, _ := os.Hostname()
	if deviceName == "" {
		deviceName = "gitfuse-device"
	}
	deviceID, err := currentDeviceID()
	if err != nil {
		return "", "", err
	}
	return deviceName, deviceID, nil
}

func currentDeviceID() (string, error) {
	deviceID, err := config.ReadDeviceID()
	if err == nil {
		return deviceID, nil
	}
	if !os.IsNotExist(err) {
		return "", err
	}
	return config.GenerateDeviceID()
}

func storeAuthCredentials(result deviceAuthResponse, relayURL string) error {
	key, err := gfcrypto.GenerateIdentityString()
	if err != nil {
		return err
	}
	if relayURL != "" {
		if err := config.PersistRelayURL(relayURL); err != nil {
			return err
		}
	}
	_, err = config.WriteCredentials(config.Credentials{
		Username:     result.Username,
		Token:        result.Token,
		DeviceID:     result.DeviceID,
		Key:          key,
		RegisteredAt: time.Now(),
	})
	if err != nil {
		return err
	}
	if result.DeviceID != "" {
		return config.WriteDeviceID(result.DeviceID)
	}
	return nil
}

func dashboardRelayURL() string {
	resolved, err := resolveRelayURL()
	if err != nil {
		return ""
	}
	return resolved.URL
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
