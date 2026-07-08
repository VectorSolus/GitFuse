#!/bin/sh
set -eu

GITFUSE_REPO="${GITFUSE_REPO:-gitfuse/test-repo-2}"
GITFUSE_DOWNLOAD_BASE="${GITFUSE_DOWNLOAD_BASE:-https://github.com/$GITFUSE_REPO/releases/download}"
GITFUSE_LATEST_RELEASE_URL="${GITFUSE_LATEST_RELEASE_URL:-https://api.github.com/repos/$GITFUSE_REPO/releases/latest}"

die() {
  printf '%s\n' "gitfuse install: $*" >&2
  exit 1
}

detect_os() {
  case "${GITFUSE_TEST_UNAME_S:-$(uname -s 2>/dev/null)}" in
    Linux) printf '%s\n' linux ;;
    Darwin) printf '%s\n' darwin ;;
    *) die "unsupported operating system" ;;
  esac
}

detect_arch() {
  case "${GITFUSE_TEST_UNAME_M:-$(uname -m 2>/dev/null)}" in
    x86_64 | amd64) printf '%s\n' amd64 ;;
    arm64 | aarch64) printf '%s\n' arm64 ;;
    *) die "unsupported architecture" ;;
  esac
}

validate_version() {
  case "$1" in
    v[0-9]*.[0-9]*.[0-9]* | [0-9]*.[0-9]*.[0-9]*) return 0 ;;
    *) die "GITFUSE_VERSION must look like v1.2.3" ;;
  esac
}

without_v() {
  printf '%s\n' "$1" | sed 's/^v//'
}

resolve_version() {
  if [ "${GITFUSE_VERSION:-}" ]; then
    validate_version "$GITFUSE_VERSION"
    printf '%s\n' "$GITFUSE_VERSION"
    return 0
  fi

  response="$("$CURL" -fsSL "$GITFUSE_LATEST_RELEASE_URL")" || die "could not resolve latest release"
  tag="$(printf '%s\n' "$response" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ "$tag" ] || die "latest release response did not contain tag_name"
  validate_version "$tag"
  printf '%s\n' "$tag"
}

find_curl() {
  command -v curl >/dev/null 2>&1 || die "curl is required"
  printf '%s\n' curl
}

find_checksum_tool() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s\n' shasum
  elif command -v openssl >/dev/null 2>&1; then
    printf '%s\n' openssl
  else
    die "no supported SHA-256 checksum tool found"
  fi
}

checksum_file() {
  tool="$1"
  file="$2"
  case "$tool" in
    sha256sum) sha256sum "$file" | awk '{print $1}' ;;
    shasum) shasum -a 256 "$file" | awk '{print $1}' ;;
    openssl) openssl dgst -sha256 "$file" | awk '{print $NF}' ;;
    *) die "unsupported checksum tool" ;;
  esac
}

choose_install_dir() {
  if [ "${GITFUSE_INSTALL_DIR:-}" ]; then
    printf '%s\n' "$GITFUSE_INSTALL_DIR"
    return 0
  fi
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    printf '%s\n' /usr/local/bin
    return 0
  fi
  printf '%s\n' "$HOME/.local/bin"
}

download_file() {
  url="$1"
  dest="$2"
  "$CURL" -fsSL "$url" -o "$dest"
}

verify_checksum() {
  archive="$1"
  checksums="$2"
  archive_name="$3"
  tool="$4"
  expected="$(awk -v name="$archive_name" '$2 == name {print $1}' "$checksums" | head -n 1)"
  [ "$expected" ] || die "checksums.txt does not contain $archive_name"
  actual="$(checksum_file "$tool" "$archive")"
  [ "$actual" = "$expected" ] || die "checksum mismatch for $archive_name"
}

validate_archive_paths() {
  archive="$1"
  tar -tzf "$archive" | while IFS= read -r path; do
    case "$path" in
      "" | /* | *"/../"* | ../* | *"/.." | ..) die "unsafe archive path: $path" ;;
    esac
  done
}

install_binary() {
  extracted_dir="$1"
  install_dir="$2"
  binary="$extracted_dir/gitfuse"
  [ -f "$binary" ] || die "archive did not contain gitfuse"
  mkdir -p "$install_dir"
  cp "$binary" "$install_dir/gitfuse"
  chmod 755 "$install_dir/gitfuse"
}

path_contains() {
  needle="$1"
  old_ifs="$IFS"
  IFS=:
  for entry in $PATH; do
    if [ "$entry" = "$needle" ]; then
      IFS="$old_ifs"
      return 0
    fi
  done
  IFS="$old_ifs"
  return 1
}

main() {
  CURL="$(find_curl)"
  CHECKSUM_TOOL="$(find_checksum_tool)"
  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ "$os" = darwin ]; then
    printf '%s\n' "Homebrew is the recommended macOS installer: brew install gitfuse"
  fi
  [ "$os" = linux ] || die "this installer supports Linux archives only"

  version_tag="$(resolve_version)"
  version="$(without_v "$version_tag")"
  archive_name="gitfuse_${version}_${os}_${arch}.tar.gz"
  base="$GITFUSE_DOWNLOAD_BASE/$version_tag"

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-install.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

  archive="$tmp_dir/$archive_name"
  checksums="$tmp_dir/checksums.txt"
  download_file "$base/$archive_name" "$archive" || die "missing archive $archive_name"
  download_file "$base/checksums.txt" "$checksums" || die "missing checksums.txt"
  verify_checksum "$archive" "$checksums" "$archive_name" "$CHECKSUM_TOOL"
  validate_archive_paths "$archive"
  tar -xzf "$archive" -C "$tmp_dir"

  install_dir="$(choose_install_dir)"
  install_binary "$tmp_dir" "$install_dir"

  printf '%s\n' "Installed gitfuse to $install_dir/gitfuse"
  if ! path_contains "$install_dir"; then
    printf '%s\n' "Add $install_dir to PATH before opening a new terminal."
  fi
  printf '%s\n' "Run 'gitfuse auth login' to get started."
}

if [ "${GITFUSE_INSTALL_TESTING:-0}" != "1" ]; then
  main "$@"
fi
