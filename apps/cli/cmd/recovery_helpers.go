package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
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
	if deviceToken() == "" {
		return nil, fmt.Errorf("not authenticated; run 'gitfuse auth' first")
	}
	req, err := http.NewRequest(http.MethodGet, relayBaseURL()+"/v1/repos", nil)
	if err != nil {
		return nil, err
	}
	body, status, err := doAuthorizedRequest(req)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNoContent {
		return []relayRepository{}, nil
	}
	var decoded struct {
		Repositories []relayRepository `json:"repositories"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
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
