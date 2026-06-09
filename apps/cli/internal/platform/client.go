package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

type CreateRepositoryRequest struct {
	Name       string
	Private    bool
	Provider   string
	APIToken   string
	APIBaseURL string
}

type Repository struct {
	Name       string
	CloneURL   string
	Provider   string
	Visibility string
}

func CreateRepository(ctx context.Context, request CreateRepositoryRequest) (Repository, error) {
	provider := strings.ToLower(request.Provider)
	switch provider {
	case "github":
		return createGitHubRepository(ctx, request)
	case "gitlab":
		return createGitLabRepository(ctx, request)
	case "bitbucket":
		return createBitbucketRepository(ctx, request)
	default:
		return Repository{}, fmt.Errorf("unsupported platform %q", request.Provider)
	}
}

func createRepositoryViaHTTP(ctx context.Context, request CreateRepositoryRequest, fallbackHost string) (Repository, error) {
	visibility := "public"
	if request.Private {
		visibility = "private"
	}
	if request.APIBaseURL == "" && os.Getenv("GITFUSE_PLATFORM_MOCK") != "0" {
		return Repository{
			Name:       request.Name,
			CloneURL:   fmt.Sprintf("https://%s/gitfuse/%s.git", fallbackHost, request.Name),
			Provider:   request.Provider,
			Visibility: visibility,
		}, nil
	}
	if request.APIToken == "" {
		return Repository{}, fmt.Errorf("%s API token required", request.Provider)
	}
	payload, _ := json.Marshal(map[string]any{
		"name":    request.Name,
		"private": request.Private,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(request.APIBaseURL, "/")+"/repos", bytes.NewReader(payload))
	if err != nil {
		return Repository{}, err
	}
	req.Header.Set("authorization", "Bearer "+request.APIToken)
	req.Header.Set("content-type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Repository{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Repository{}, fmt.Errorf("%s repository creation failed with status %d", request.Provider, resp.StatusCode)
	}
	var decoded struct {
		CloneURL string `json:"cloneUrl"`
		HTMLURL  string `json:"html_url"`
		SSHURL   string `json:"ssh_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return Repository{}, err
	}
	cloneURL := decoded.CloneURL
	if cloneURL == "" {
		cloneURL = decoded.HTMLURL
	}
	if cloneURL == "" {
		cloneURL = decoded.SSHURL
	}
	return Repository{Name: request.Name, CloneURL: cloneURL, Provider: request.Provider, Visibility: visibility}, nil
}
