package platform

import "context"

func createGitLabRepository(ctx context.Context, request CreateRepositoryRequest) (Repository, error) {
	request.Provider = "gitlab"
	return createRepositoryViaHTTP(ctx, request, "gitlab.com")
}
