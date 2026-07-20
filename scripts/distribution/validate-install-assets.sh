#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILURES=0

log() {
  printf '[distribution-assets] %s\n' "$*"
}

pass() {
  log "ok: $*"
}

fail() {
  printf '[distribution-assets] FAIL: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

check_file() {
  local path="$1"

  if [ -f "$ROOT/$path" ]; then
    pass "$path exists"
  else
    fail "$path is missing"
  fi
}

check_contains() {
  local path="$1"
  local needle="$2"
  local label="$3"

  if grep -F -q -- "$needle" "$ROOT/$path" 2>/dev/null; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_matches() {
  local path="$1"
  local pattern="$2"
  local label="$3"

  if grep -E -q -- "$pattern" "$ROOT/$path" 2>/dev/null; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_not_matches() {
  local path="$1"
  local pattern="$2"
  local label="$3"

  if grep -E -q -- "$pattern" "$ROOT/$path" 2>/dev/null; then
    fail "$label"
  else
    pass "$label"
  fi
}

run_check() {
  local label="$1"
  shift

  if "$@" >/tmp/gitfuse-distribution-validation.out 2>/tmp/gitfuse-distribution-validation.err; then
    pass "$label"
  else
    fail "$label"
    sed 's/^/[distribution-assets]   /' /tmp/gitfuse-distribution-validation.err >&2
  fi
}

INSTALLER="install.sh"
FORMULA="packaging/homebrew/Formula/gitfuse.rb"
DOCS="docs/distribution/README.md"
PRESENCE_SCRIPT="scripts/distribution/check-distribution-presence.sh"
VALIDATION_SCRIPT="scripts/distribution/validate-install-assets.sh"
RENDER_SCRIPT="scripts/distribution/render-release-urls.sh"

check_file "$INSTALLER"
check_contains "$INSTALLER" "#!/usr/bin/env sh" "install.sh uses sh shebang"
check_contains "$INSTALLER" "set -eu" "install.sh uses set -eu"
check_not_matches "$INSTALLER" '(^|[[:space:];&|])eval([[:space:];&|]|$)' "install.sh does not use eval"
check_not_matches "$INSTALLER" '\|[[:space:]]*(sh|bash)([[:space:]]|$)' "install.sh does not invoke pipe-to-shell"
check_contains "$INSTALLER" "GITFUSE_VERSION" "install.sh supports GITFUSE_VERSION"
check_contains "$INSTALLER" "GITFUSE_INSTALL_DIR" "install.sh supports GITFUSE_INSTALL_DIR"
check_contains "$INSTALLER" ".sha256" "install.sh requests per-artifact .sha256"
check_contains "$INSTALLER" "verify_checksum" "install.sh has checksum verification logic"
check_contains "$INSTALLER" "GITFUSE_SKIP_CHECKSUM" "install.sh has explicit checksum override"

check_file "$FORMULA"
check_contains "$FORMULA" "class Gitfuse < Formula" "Homebrew formula class exists"
check_contains "$FORMULA" "bin.install \"gitfuse\"" "Homebrew formula installs gitfuse binary"
check_contains "$FORMULA" "test do" "Homebrew formula has test block"
check_matches "$FORMULA" 'darwin_(arm64|amd64)' "Homebrew formula has macOS artifact placeholders"
check_matches "$FORMULA" 'linux_(arm64|amd64)' "Homebrew formula has Linux artifact placeholders"

for manifest in \
  "packaging/winget/GitFuse.GitFuse.yaml" \
  "packaging/winget/GitFuse.GitFuse.installer.yaml" \
  "packaging/winget/GitFuse.GitFuse.locale.en-US.yaml"
do
  check_file "$manifest"
  check_contains "$manifest" "PackageIdentifier: GitFuse.GitFuse" "$manifest has PackageIdentifier GitFuse.GitFuse"
done

check_file "$DOCS"
check_contains "$DOCS" "curl -fsSL https://gitfuse.dev/install.sh | sh" "docs include curl installer command"
check_contains "$DOCS" "brew tap gitfuse/tap" "docs include brew tap command"
check_contains "$DOCS" "brew install gitfuse" "docs include brew install command"
check_contains "$DOCS" "winget install GitFuse.GitFuse" "docs include winget install command"

check_file "$PRESENCE_SCRIPT"
run_check "sh -n install.sh" sh -n "$ROOT/install.sh"
run_check "bash -n scripts/distribution/validate-install-assets.sh" bash -n "$ROOT/$VALIDATION_SCRIPT"
run_check "bash -n scripts/distribution/check-distribution-presence.sh" bash -n "$ROOT/$PRESENCE_SCRIPT"

if [ -f "$ROOT/$RENDER_SCRIPT" ]; then
  run_check "bash -n scripts/distribution/render-release-urls.sh" bash -n "$ROOT/$RENDER_SCRIPT"
fi

if command -v brew >/dev/null 2>&1 && command -v ruby >/dev/null 2>&1; then
  run_check "ruby -c packaging/homebrew/Formula/gitfuse.rb" ruby -c "$ROOT/$FORMULA"
else
  pass "ruby formula syntax check skipped because brew or ruby is unavailable"
fi

rm -f /tmp/gitfuse-distribution-validation.out /tmp/gitfuse-distribution-validation.err

if [ "$FAILURES" -eq 0 ]; then
  printf '%s\n' "DISTRIBUTION_ASSETS_VALIDATION=PASS"
  exit 0
fi

printf '%s\n' "DISTRIBUTION_ASSETS_VALIDATION=FAIL"
exit 1
