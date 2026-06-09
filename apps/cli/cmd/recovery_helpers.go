package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

type relayRepository struct {
	ID           string `json:"id"`
	UserID       string `json:"userId"`
	RootSHA      string `json:"rootSha"`
	DisplayName  string `json:"displayName"`
	RemoteURL    string `json:"remoteUrl"`
	RelayEntryID string `json:"relayEntryId"`
	CreatedAt    string `json:"createdAt"`
	LastSyncedAt string `json:"lastSyncedAt"`
}

func loadRelayRepositories() ([]relayRepository, error) {
	if fixture := os.Getenv("GITFUSE_REPOS_FIXTURE"); fixture != "" {
		content, err := os.ReadFile(fixture)
		if err != nil {
			return nil, err
		}
		return decodeRelayRepositories(content)
	}
	relayURL := strings.TrimRight(os.Getenv("GITFUSE_RELAY_URL"), "/")
	token := os.Getenv("GITFUSE_TEST_TOKEN")
	if relayURL == "" || token == "" {
		return nil, fmt.Errorf("relay repository list unavailable; set GITFUSE_REPOS_FIXTURE or relay credentials")
	}
	req, err := http.NewRequest(http.MethodGet, relayURL+"/v1/repos", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("relay repo list failed with status %d", resp.StatusCode)
	}
	var decoded struct {
		Repositories []relayRepository `json:"repositories"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}
	return decoded.Repositories, nil
}

func decodeRelayRepositories(content []byte) ([]relayRepository, error) {
	var decoded struct {
		Repositories []relayRepository `json:"repositories"`
	}
	if err := json.Unmarshal(content, &decoded); err != nil {
		return nil, err
	}
	return decoded.Repositories, nil
}

func findRelayRepository(name string, repos []relayRepository) (relayRepository, bool) {
	for _, repo := range repos {
		if repo.DisplayName == name || repo.RelayEntryID == name {
			return repo, true
		}
	}
	return relayRepository{}, false
}
