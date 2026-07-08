#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALLER="$ROOT_DIR/scripts/install.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-install-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT HUP INT TERM

fail() {
  printf '%s\n' "install.test: $*" >&2
  exit 1
}

pass() {
  printf '%s\n' "ok - $*"
}

run_ok() {
  name="$1"
  shift
  "$@" >/tmp/gitfuse-install-test.out 2>/tmp/gitfuse-install-test.err || {
    cat /tmp/gitfuse-install-test.err >&2
    fail "$name failed"
  }
  pass "$name"
}

run_fail() {
  name="$1"
  shift
  if "$@" >/tmp/gitfuse-install-test.out 2>/tmp/gitfuse-install-test.err; then
    fail "$name unexpectedly succeeded"
  fi
  pass "$name"
}

make_release() {
  release_dir="$1"
  version="$2"
  os="$3"
  arch="$4"
  binary_name="${5:-gitfuse}"
  mkdir -p "$release_dir/$version/build"
  printf '%s\n' '#!/bin/sh' 'printf "gitfuse fixture\n"' >"$release_dir/$version/build/$binary_name"
  chmod 755 "$release_dir/$version/build/$binary_name"
  archive="gitfuse_$(printf '%s' "$version" | sed 's/^v//')_${os}_${arch}.tar.gz"
  (cd "$release_dir/$version/build" && tar -czf "../$archive" "$binary_name")
  checksum="$(checksum "$release_dir/$version/$archive")"
  printf '%s  %s\n' "$checksum" "$archive" >"$release_dir/$version/checksums.txt"
}

checksum() {
  file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

run_installer() {
  release_dir="$1"
  install_dir="$2"
  GITFUSE_VERSION=v0.1.0 \
  GITFUSE_DOWNLOAD_BASE="file://$release_dir" \
  GITFUSE_INSTALL_DIR="$install_dir" \
  GITFUSE_TEST_UNAME_S=Linux \
  GITFUSE_TEST_UNAME_M=x86_64 \
  PATH="$PATH" \
  sh "$INSTALLER"
}

run_ok "amd64 maps to amd64" sh -c "GITFUSE_INSTALL_TESTING=1 GITFUSE_TEST_UNAME_M=x86_64 . '$INSTALLER'; [ \"\$(detect_arch)\" = amd64 ]"
run_ok "arm64 maps to arm64" sh -c "GITFUSE_INSTALL_TESTING=1 GITFUSE_TEST_UNAME_M=aarch64 . '$INSTALLER'; [ \"\$(detect_arch)\" = arm64 ]"
run_fail "unsupported architecture fails" sh -c "GITFUSE_INSTALL_TESTING=1 GITFUSE_TEST_UNAME_M=mips . '$INSTALLER'; detect_arch"

release_dir="$TEST_ROOT/release"
install_dir="$TEST_ROOT/bin"
make_release "$release_dir" v0.1.0 linux amd64 gitfuse
run_ok "checksum success and user-selected install dir" run_installer "$release_dir" "$install_dir"
[ -x "$install_dir/gitfuse" ] || fail "installed binary is missing"

bad_release="$TEST_ROOT/bad-release"
make_release "$bad_release" v0.1.0 linux amd64 gitfuse
printf '%s  %s\n' "0000" "gitfuse_0.1.0_linux_amd64.tar.gz" >"$bad_release/v0.1.0/checksums.txt"
run_fail "checksum mismatch fails" run_installer "$bad_release" "$TEST_ROOT/bad-bin"

missing_release="$TEST_ROOT/missing-release"
mkdir -p "$missing_release/v0.1.0"
run_fail "missing archive fails" run_installer "$missing_release" "$TEST_ROOT/missing-bin"

wrong_name_release="$TEST_ROOT/wrong-name"
make_release "$wrong_name_release" v0.1.0 linux amd64 not-gitfuse
run_fail "extracted binary name validation fails" run_installer "$wrong_name_release" "$TEST_ROOT/wrong-bin"

run_fail "malformed latest response fails" sh -c "printf '{}' > '$TEST_ROOT/latest.json'; GITFUSE_INSTALL_TESTING=1 GITFUSE_VERSION='' GITFUSE_LATEST_RELEASE_URL='file://$TEST_ROOT/latest.json' . '$INSTALLER'; CURL=curl; resolve_version"
run_fail "no checksum tool fails closed" sh -c "GITFUSE_INSTALL_TESTING=1 PATH=/nonexistent . '$INSTALLER'; find_checksum_tool"
run_ok "explicit version validation accepts semver" sh -c "GITFUSE_INSTALL_TESTING=1 . '$INSTALLER'; validate_version v1.2.3"
run_fail "malformed explicit version fails" sh -c "GITFUSE_INSTALL_TESTING=1 . '$INSTALLER'; validate_version latest"

cleanup_dir="$TEST_ROOT/cleanup"
mkdir -p "$cleanup_dir"
TMPDIR="$cleanup_dir" run_fail "cleanup after failure" run_installer "$bad_release" "$TEST_ROOT/cleanup-bin"
if find "$cleanup_dir" -type d -name 'gitfuse-install.*' | grep . >/dev/null 2>&1; then
  fail "temporary installer directory was not cleaned"
fi
pass "temporary files cleaned after failure"
