package cmd

import (
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
	if base := os.Getenv("GITFUSE_RELAY_URL"); base != "" {
		return strings.TrimRight(base, "/")
	}
	return "http://localhost:8787"
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
		return nil, 0, fmt.Errorf("not authenticated; run 'gitfuse auth'")
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
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return body, resp.StatusCode, fmt.Errorf("request failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, resp.StatusCode, nil
}
