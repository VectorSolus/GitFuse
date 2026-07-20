# GitFuse Distribution

These files prepare GitFuse distribution assets for local verification before any external acceptance phase. They do not create public package-manager entries, do not prove `gitfuse.dev` DNS, and do not submit anything to Homebrew or WinGet.

## Launch Path

1. Serve the curl installer at `https://gitfuse.dev/install.sh`.
2. Publish a custom Homebrew tap at `gitfuse/homebrew-tap`.
3. Submit WinGet manifests to `microsoft/winget-pkgs`.
4. Pursue official Homebrew later, after public adoption and stable release evidence.

User-facing commands once the matching public endpoints exist:

```sh
curl -fsSL https://gitfuse.dev/install.sh | sh
brew tap gitfuse/tap
brew install gitfuse
winget install GitFuse.GitFuse
```

## Release Artifacts

The distribution templates expect GitHub Releases under `https://github.com/gitfuse/gitfuse/releases`.

Versioned archive convention:

```text
gitfuse_<version>_darwin_arm64.tar.gz
gitfuse_<version>_darwin_amd64.tar.gz
gitfuse_<version>_linux_arm64.tar.gz
gitfuse_<version>_linux_amd64.tar.gz
gitfuse_<version>_windows_arm64.zip
gitfuse_<version>_windows_amd64.zip
```

For example:

```text
https://github.com/gitfuse/gitfuse/releases/download/v0.1.0/gitfuse_v0.1.0_linux_amd64.tar.gz
https://github.com/gitfuse/gitfuse/releases/download/v0.1.0/gitfuse_v0.1.0_windows_amd64.zip
```

Each archive must have a matching SHA-256 file at the archive URL plus `.sha256`, for example:

```text
gitfuse_v0.1.0_linux_amd64.tar.gz.sha256
```

The root installer defaults to `GITFUSE_VERSION=latest` and uses this latest-release convention:

```text
https://github.com/gitfuse/gitfuse/releases/latest/download/gitfuse_latest_<target>.tar.gz
```

Operators can render the expected URLs without network access:

```sh
bash scripts/distribution/render-release-urls.sh
GITFUSE_VERSION=v0.1.0 bash scripts/distribution/render-release-urls.sh
```

## Local Validation

Run the local asset validation before attempting public distribution:

```sh
bash scripts/distribution/validate-install-assets.sh
bash scripts/distribution/check-distribution-presence.sh
```

`check-distribution-presence.sh` reports remote presence only. `NO` is acceptable before DNS, public tap creation, WinGet acceptance, and official Homebrew acceptance are complete.

## Release Checklist

- Create GitHub release.
- Upload artifacts.
- Upload `.sha256` files.
- Verify `install.sh` against release.
- Copy `packaging/homebrew/Formula/gitfuse.rb` to the `gitfuse/homebrew-tap` repository.
- Replace Homebrew formula SHA values.
- Run `brew audit`, `brew install`, and `brew test` locally.
- Create WinGet manifests from the templates.
- Run `winget validate` on Windows.
- Submit WinGet PR.

Official Homebrew acceptance is a later adoption milestone and should not block launch through the curl installer, custom tap, and WinGet submission path.
