package platform

import "context"

func createGitHubRepository(ctx context.Context, request CreateRepositoryRequest) (Repository, error) {
	request.Provider = "github"
	return createRepositoryViaHTTP(ctx, request, "github.com")
}
