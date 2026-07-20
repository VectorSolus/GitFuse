#!/usr/bin/env bash
set -euo pipefail

GITFUSE_OWNER="${GITFUSE_OWNER:-gitfuse}"
GITFUSE_REPO="${GITFUSE_REPO:-gitfuse}"
GITFUSE_VERSION="${GITFUSE_VERSION:-v0.1.0}"

if [ "$GITFUSE_VERSION" = "latest" ]; then
  base="https://github.com/$GITFUSE_OWNER/$GITFUSE_REPO/releases/latest/download"
else
  base="https://github.com/$GITFUSE_OWNER/$GITFUSE_REPO/releases/download/$GITFUSE_VERSION"
fi

archive_url() {
  local target="$1"
  local extension="$2"
  printf '%s/gitfuse_%s_%s.%s\n' "$base" "$GITFUSE_VERSION" "$target" "$extension"
}

for target in darwin_arm64 darwin_amd64 linux_arm64 linux_amd64; do
  url="$(archive_url "$target" "tar.gz")"
  printf '%s\n' "$url"
  printf '%s.sha256\n' "$url"
done

for target in windows_arm64 windows_amd64; do
  url="$(archive_url "$target" "zip")"
  printf '%s\n' "$url"
  printf '%s.sha256\n' "$url"
done
