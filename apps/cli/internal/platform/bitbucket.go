package platform

import "context"

func createBitbucketRepository(ctx context.Context, request CreateRepositoryRequest) (Repository, error) {
	request.Provider = "bitbucket"
	return createRepositoryViaHTTP(ctx, request, "bitbucket.org")
}
