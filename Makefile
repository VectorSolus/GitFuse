.PHONY: build-cli test-cli release-check release-snapshot dev deploy-relay

build-cli:
	mkdir -p bin
	go -C apps/cli build -trimpath -o ../../bin/gitfuse .

test-cli:
	go -C apps/cli test ./...

release-check:
	test -n "$$GITFUSE_RELEASE_RELAY_URL"
	scripts/validate-release-relay-url.sh "$$GITFUSE_RELEASE_RELAY_URL"
	goreleaser check

release-snapshot:
	test -n "$$GITFUSE_RELEASE_RELAY_URL"
	scripts/validate-release-relay-url.sh "$$GITFUSE_RELEASE_RELAY_URL"
	goreleaser build --snapshot --clean

dev:
	pnpm --parallel --filter @gitfuse/dashboard --filter @gitfuse/relay dev

deploy-relay:
	command -v railway
	railway up --service gitfuse-relay
