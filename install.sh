#!/usr/bin/env sh
set -eu

GITFUSE_OWNER="${GITFUSE_OWNER:-gitfuse}"
GITFUSE_REPO="${GITFUSE_REPO:-gitfuse}"
GITFUSE_VERSION="${GITFUSE_VERSION:-latest}"
GITFUSE_RELEASE_BASE_URL="${GITFUSE_RELEASE_BASE_URL:-https://github.com/$GITFUSE_OWNER/$GITFUSE_REPO/releases}"

say() {
  printf '%s\n' "gitfuse install: $*"
}

warn() {
  printf '%s\n' "gitfuse install: warning: $*" >&2
}

die() {
  printf '%s\n' "gitfuse install: error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

detect_target() {
  os="$(uname -s 2>/dev/null || printf unknown)"
  arch="$(uname -m 2>/dev/null || printf unknown)"

  case "$os:$arch" in
    Darwin:arm64) printf '%s\n' darwin_arm64 ;;
    Darwin:x86_64) printf '%s\n' darwin_amd64 ;;
    Linux:arm64 | Linux:aarch64) printf '%s\n' linux_arm64 ;;
    Linux:x86_64 | Linux:amd64) printf '%s\n' linux_amd64 ;;
    MINGW*:*)
      die "Windows installation is supported through WinGet: winget install GitFuse.GitFuse"
      ;;
    MSYS*:*)
      die "Windows installation is supported through WinGet: winget install GitFuse.GitFuse"
      ;;
    CYGWIN*:*)
      die "Windows installation is supported through WinGet: winget install GitFuse.GitFuse"
      ;;
    *)
      die "unsupported platform: $os/$arch"
      ;;
  esac
}

validate_version() {
  case "$1" in
    latest | v[0-9]*.[0-9]*.[0-9]* | [0-9]*.[0-9]*.[0-9]*) return 0 ;;
    *) die "GITFUSE_VERSION must be latest or look like v1.2.3" ;;
  esac
}

artifact_url() {
  version="$1"
  target="$2"

  if [ "$version" = "latest" ]; then
    printf '%s\n' "$GITFUSE_RELEASE_BASE_URL/latest/download/gitfuse_latest_${target}.tar.gz"
    return 0
  fi

  printf '%s\n' "$GITFUSE_RELEASE_BASE_URL/download/$version/gitfuse_${version}_${target}.tar.gz"
}

download_file() {
  url="$1"
  dest="$2"
  curl -fsSL "$url" -o "$dest"
}

find_checksum_tool() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s\n' shasum
  elif command -v openssl >/dev/null 2>&1; then
    printf '%s\n' openssl
  else
    die "no supported SHA-256 tool found"
  fi
}

checksum_file() {
  tool="$1"
  file="$2"

  case "$tool" in
    sha256sum) sha256sum "$file" | awk '{print $1}' ;;
    shasum) shasum -a 256 "$file" | awk '{print $1}' ;;
    openssl) openssl dgst -sha256 "$file" | awk '{print $NF}' ;;
    *) die "unsupported checksum tool: $tool" ;;
  esac
}

extract_expected_sha256() {
  file="$1"
  sed -n 's/.*\([A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9]\).*/\1/p' "$file" | head -n 1 | tr 'A-F' 'a-f'
}

verify_checksum() {
  archive="$1"
  checksum_path="$2"
  tool="$3"

  expected="$(extract_expected_sha256 "$checksum_path")"
  [ "$expected" ] || die "checksum file did not contain a SHA-256 digest"

  actual="$(checksum_file "$tool" "$archive" | tr 'A-F' 'a-f')"
  [ "$actual" = "$expected" ] || die "checksum mismatch for downloaded archive"
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

  [ "${HOME:-}" ] || die "HOME is not set; set GITFUSE_INSTALL_DIR to a writable directory"
  printf '%s\n' "$HOME/.local/bin"
}

ensure_install_dir() {
  install_dir="$1"

  if [ ! -d "$install_dir" ]; then
    mkdir -p "$install_dir" 2>/dev/null || die "could not create $install_dir; choose a writable GITFUSE_INSTALL_DIR"
  fi

  if [ ! -w "$install_dir" ]; then
    die "$install_dir is not writable; this script does not invoke sudo, so choose a writable GITFUSE_INSTALL_DIR or rerun after reviewing the script"
  fi
}

validate_archive_paths() {
  archive="$1"
  list_file="$2"

  tar -tzf "$archive" >"$list_file" || die "downloaded archive is not a readable tar.gz file"
  while IFS= read -r path; do
    case "$path" in
      "" | /* | ../* | *"/../"* | *"/.." | "..")
        die "unsafe archive path: $path"
        ;;
    esac
  done <"$list_file"
}

find_gitfuse_binary() {
  extracted_dir="$1"
  binary_path="$(find "$extracted_dir" -type f -name gitfuse -print | head -n 1)"
  [ "$binary_path" ] || die "archive did not contain a gitfuse binary"
  printf '%s\n' "$binary_path"
}

verify_installed_binary() {
  binary="$1"

  say "verifying installed binary"
  if "$binary" version; then
    return 0
  fi
  if "$binary" --version; then
    return 0
  fi

  die "installed binary did not respond to 'gitfuse version' or 'gitfuse --version'"
}

main() {
  require_command curl
  require_command tar
  require_command find
  require_command awk
  require_command sed

  validate_version "$GITFUSE_VERSION"

  target="$(detect_target)"
  url="$(artifact_url "$GITFUSE_VERSION" "$target")"
  checksum_url="$url.sha256"
  checksum_tool="$(find_checksum_tool)"
  install_dir="$(choose_install_dir)"

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-install.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

  archive="$tmp_dir/gitfuse.tar.gz"
  checksum_path="$tmp_dir/gitfuse.tar.gz.sha256"
  extract_dir="$tmp_dir/extract"
  list_file="$tmp_dir/archive.list"

  say "platform target: $target"
  say "downloading $url"
  download_file "$url" "$archive" || die "could not download release archive"

  if download_file "$checksum_url" "$checksum_path"; then
    say "verifying checksum from $checksum_url"
    verify_checksum "$archive" "$checksum_path" "$checksum_tool"
  else
    if [ "${GITFUSE_SKIP_CHECKSUM:-0}" = "1" ]; then
      warn "checksum file unavailable at $checksum_url; continuing because GITFUSE_SKIP_CHECKSUM=1"
    else
      die "checksum file unavailable at $checksum_url; refusing to install. Set GITFUSE_SKIP_CHECKSUM=1 only for a trusted local test."
    fi
  fi

  mkdir -p "$extract_dir"
  validate_archive_paths "$archive" "$list_file"
  tar -xzf "$archive" -C "$extract_dir"

  binary_path="$(find_gitfuse_binary "$extract_dir")"
  ensure_install_dir "$install_dir"
  cp "$binary_path" "$install_dir/gitfuse" || die "could not copy gitfuse into $install_dir"
  chmod +x "$install_dir/gitfuse" || die "could not mark $install_dir/gitfuse executable"

  verify_installed_binary "$install_dir/gitfuse"
  say "successfully installed gitfuse to $install_dir/gitfuse"
}

main "$@"
