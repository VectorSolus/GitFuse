#!/bin/sh
set -eu

REPO="VectorSolus/GitFuse"
GITHUB_BASE_URL="https://github.com/${REPO}/releases/download"
GITHUB_API_URL="https://api.github.com/repos/${REPO}/releases/latest"

fail() {
  echo "gitfuse installer: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

need_cmd curl
need_cmd tar
need_cmd uname
need_cmd awk
need_cmd sed
need_cmd grep
need_cmd tr
need_cmd chmod
need_cmd mkdir
need_cmd mv
need_cmd rm

VERSION="${GITFUSE_VERSION:-latest}"

if [ "$VERSION" = "latest" ]; then
  RELEASE_JSON="$(curl -fsSL "$GITHUB_API_URL")"
  TAG_NAME="$(printf '%s\n' "$RELEASE_JSON" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"

  if [ -z "$TAG_NAME" ]; then
    fail "could not resolve latest GitFuse release"
  fi

  case "$TAG_NAME" in
    v*) VERSION="${TAG_NAME#v}" ;;
    *) VERSION="$TAG_NAME" ;;
  esac
fi

case "$VERSION" in
  ""|*[!0-9A-Za-z._-]*)
    fail "invalid GITFUSE_VERSION: $VERSION"
    ;;
esac

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  *) fail "unsupported operating system: $OS" ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) fail "unsupported architecture: $ARCH" ;;
esac

ARCHIVE="gitfuse_${VERSION}_${OS}_${ARCH}.tar.gz"
RELEASE_URL="${GITHUB_BASE_URL}/v${VERSION}"
ARCHIVE_URL="${RELEASE_URL}/${ARCHIVE}"
CHECKSUMS_URL="${RELEASE_URL}/checksums.txt"

TMPDIR_ROOT="${TMPDIR:-/tmp}"
TMPDIR="$(mktemp -d "${TMPDIR_ROOT%/}/gitfuse.XXXXXX" 2>/dev/null || mktemp -d -t gitfuse)"
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT INT TERM

ARCHIVE_PATH="$TMPDIR/$ARCHIVE"
CHECKSUMS_PATH="$TMPDIR/checksums.txt"

echo "Installing gitfuse v${VERSION} for ${OS}/${ARCH}..."

curl -fsSL -o "$CHECKSUMS_PATH" "$CHECKSUMS_URL"
curl -fsSL -o "$ARCHIVE_PATH" "$ARCHIVE_URL"

EXPECTED_SHA="$(awk -v file="$ARCHIVE" '($2 == file || $2 == "*" file) { print $1; exit }' "$CHECKSUMS_PATH")"
if [ -z "$EXPECTED_SHA" ]; then
  fail "checksum for $ARCHIVE not found in checksums.txt"
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
elif command -v openssl >/dev/null 2>&1; then
  ACTUAL_SHA="$(openssl dgst -sha256 "$ARCHIVE_PATH" | awk '{print $NF}')"
else
  fail "no SHA-256 tool found; install sha256sum, shasum, or openssl"
fi

EXPECTED_SHA="$(printf '%s' "$EXPECTED_SHA" | tr '[:upper:]' '[:lower:]')"
ACTUAL_SHA="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"

if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  fail "checksum mismatch for $ARCHIVE"
fi

tar -xzf "$ARCHIVE_PATH" -C "$TMPDIR" gitfuse

if [ ! -f "$TMPDIR/gitfuse" ]; then
  fail "archive did not contain gitfuse binary"
fi

chmod 755 "$TMPDIR/gitfuse"

if [ -n "${GITFUSE_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$GITFUSE_INSTALL_DIR"
elif [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
fi

mkdir -p "$INSTALL_DIR"

TMP_BIN="$INSTALL_DIR/gitfuse.tmp.$$"
mv "$TMPDIR/gitfuse" "$TMP_BIN"
chmod 755 "$TMP_BIN"
mv "$TMP_BIN" "$INSTALL_DIR/gitfuse"

echo "Installed gitfuse to $INSTALL_DIR/gitfuse"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not in your PATH."
    echo "Add it to your shell profile before running gitfuse from a new terminal."
    ;;
esac

echo "Run 'gitfuse auth login' to get started."
