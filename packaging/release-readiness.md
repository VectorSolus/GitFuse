# GitFuse Release Readiness

This repository prepares checksummed release artifacts and package-manager metadata for the public installation contract:

## Public Commands

macOS:

```sh
brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git
brew install VectorSolus/gitfuse/gitfuse
gitfuse auth login
gitfuse add .
gitfuse sync
```

Windows:

```powershell
winget install GitFuse.GitFuse
gitfuse auth login
gitfuse add .
gitfuse sync
```

Linux:

```sh
curl -fsSL https://install.gitfuse.dev | sh
gitfuse auth login
gitfuse add .
gitfuse sync
```

## Repository Implementation Complete

- GoReleaser builds checksummed release artifacts for macOS, Linux, and Windows amd64.
- `scripts/install.sh` is the canonical Linux installer that verifies `checksums.txt` before extraction.
- `packaging/homebrew/` contains Homebrew Cask template metadata and external submission notes.
- `packaging/winget/` contains Winget manifest templates and external submission notes.
- Release workflows validate the production relay URL before injecting it into release builds.

## External Publication Pending

- The public macOS command uses the primary GitFuse repository tap.
- Winget acceptance is required before `winget install GitFuse.GitFuse` works through the default source.
- DNS and hosting must serve the exact reviewed `scripts/install.sh` at `https://install.gitfuse.dev`.
- DNS and deployment must serve a verified production relay at `https://relay.gitfuse.dev`.
- A real tagged GitHub release must be run after package-publication tokens and repository variables are configured.

Do not describe any public installation command as independently verified until it has passed on the intended operating system after external publication.
