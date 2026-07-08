package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gitfuse/gitfuse/apps/cli/internal/config"
	"github.com/gitfuse/gitfuse/apps/cli/internal/relay"
)

func relayBaseURL() string {
	resolved, err := resolveRelayURL()
	if err != nil {
		return ""
	}
	return resolved.URL
}

func deviceToken() string {
	if token := os.Getenv("GITFUSE_TEST_TOKEN"); token != "" {
		return token
	}
	credentials, err := config.ReadCredentials()
	if err != nil {
		return ""
	}
	return credentials.Token
}

func doAuthorizedRequest(req *http.Request) ([]byte, int, error) {
	token := deviceToken()
	if token == "" {
		return nil, 0, fmt.Errorf(notAuthenticatedMessage)
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusUnauthorized {
		return body, resp.StatusCode, errors.New(relay.RenderAuthExpired())
	}
	if resp.StatusCode == http.StatusForbidden && strings.Contains(string(body), "device_limit_reached") {
		limitsReq, reqErr := http.NewRequestWithContext(req.Context(), http.MethodGet, relayBaseURL()+"/v1/account/limits", nil)
		if reqErr == nil {
			if limits, limitsErr := loadAccountLimitsFromRequest(limitsReq, token); limitsErr == nil {
				return body, resp.StatusCode, errors.New(renderDeviceLimitMessage(limits))
			}
		}
		return body, resp.StatusCode, errors.New("You're on the Free tier and have reached the device limit. Upgrade at gitfuse.dev/upgrade to add more devices.")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return body, resp.StatusCode, fmt.Errorf("request failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, resp.StatusCode, nil
}

func loadAccountLimitsFromRequest(req *http.Request, token string) (accountLimitsResponse, error) {
	var limits accountLimitsResponse
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return limits, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return limits, fmt.Errorf("limits request failed with status %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, &limits); err != nil {
		return limits, err
	}
	return limits, nil
}
