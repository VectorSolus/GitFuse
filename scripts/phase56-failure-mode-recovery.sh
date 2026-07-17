#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$ROOT/apps/cli"
PHASE_TMP=""
GITFUSE_BIN=""

ALLOWED_STATUS_LINES=(
  "?? apps/dashboard/components/ClientOnly.tsx"
  "?? apps/dashboard/components/GooeyNav.css"
  "?? apps/dashboard/components/GooeyNav.jsx"
  "?? apps/dashboard/components/GradientText.tsx"
  "?? apps/dashboard/components/Lightfall.css"
  "?? apps/dashboard/components/Lightfall.jsx"
  "?? apps/dashboard/components/effects/ClickSpark.jsx"
  "?? apps/dashboard/components/effects/GooeyNav.jsx"
  "?? apps/dashboard/components/effects/Lightfall.jsx"
  "?? apps/dashboard/components/effects/SoftAurora.css"
  "?? apps/dashboard/components/landing/animated-terminal.tsx"
  "?? apps/dashboard/components/landing/gradient-text.tsx"
  "?? apps/dashboard/components/landing/hero-comparison-table.tsx"
)

AUTH_TEST_HOMES=(
  "/Users/piyush/.gitfuse-task062/device2"
  "/Users/piyush/.gitfuse-task062/device1"
)

DASHBOARD_FAILURE_MODE_TESTS=(
  "auth.callbacks.test.ts"
  "auth.oauth.spec.ts"
  "auth.email-otp.spec.ts"
  "auth.cli-pair.spec.ts"
  "dashboard.route-guard.spec.ts"
  "billing.price.spec.ts"
  "billing.webhook.spec.ts"
  "lib/db.test.ts"
  "lib/devices.test.ts"
  "lib/history-service.test.ts"
  "lib/migrations.test.ts"
)

log() {
  printf '[phase56] %s\n' "$*"
}

fail() {
  printf '[phase56] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${PHASE_TMP:-}" ] && [ -d "$PHASE_TMP" ]; then
    rm -rf "$PHASE_TMP"
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

is_allowed_status_line() {
  local line="$1"

  for allowed in "${ALLOWED_STATUS_LINES[@]}"; do
    if [ "$line" = "$allowed" ]; then
      return 0
    fi
  done

  return 1
}

verify_repo_hygiene() {
  local label="$1"
  local status_output

  log "$label repo status:"
  status_output="$(git -C "$ROOT" status --short)"
  if [ -n "$status_output" ]; then
    printf '%s\n' "$status_output"
  fi

  git -C "$ROOT" diff --check
  git -C "$ROOT" diff --cached --check

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if ! is_allowed_status_line "$line"; then
      fail "$label repo hygiene failed: unexpected status line '$line'"
    fi
  done <<< "$status_output"
}

verify_no_real_env_files_tracked() {
  local tracked

  while IFS= read -r -d '' tracked; do
    case "$tracked" in
      *.env.example|*/.env.example)
        continue
        ;;
      .env|*/.env|*.env|*.env.local|*/.env.local|*.env.production|*/.env.production|*.dev.vars|*/.dev.vars)
        fail "real env file must not be tracked: $tracked"
        ;;
    esac
  done < <(git -C "$ROOT" ls-files -z)

  log "tracked env-file guard passed"
}

run_cli_tests() {
  (
    cd "$CLI_DIR"
    env -u GITFUSE_RELAY_URL -u GITFUSE_RELAY_BASE_URL -u RELAY_URL go test ./...
  )
}

build_cli() {
  mkdir -p "$PHASE_TMP/bin"
  GITFUSE_BIN="$PHASE_TMP/bin/gitfuse"
  (
    cd "$CLI_DIR"
    go build -o "$GITFUSE_BIN" .
  )
  log "built CLI at $GITFUSE_BIN"
}

run_capture() {
  local output_file="$1"
  shift

  set +e
  "$@" >"$output_file" 2>&1
  local status=$?
  set -e

  return "$status"
}

assert_contains() {
  local output="$1"
  local needle="$2"
  local label="$3"

  if ! printf '%s' "$output" | grep -F -q -- "$needle"; then
    fail "$label did not include expected text: $needle"
  fi
}

reject_raw_markers() {
  local output="$1"
  local label="$2"
  local marker

  for marker in \
    "panic:" \
    "goroutine" \
    "runtime error" \
    "reference not found" \
    "500 internal server error" \
    "stack trace"; do
    if printf '%s' "$output" | grep -F -i -q -- "$marker"; then
      fail "$label exposed raw failure marker: $marker"
    fi
  done
}

test_unauthenticated_empty_pull() {
  local home_dir="$PHASE_TMP/unauth-home"
  local config_dir="$home_dir/.gitfuse"
  local repo_dir="$PHASE_TMP/unauth-empty-repo"
  local output_file="$PHASE_TMP/unauth-empty-pull.out"
  local output
  local status

  mkdir -p "$home_dir" "$repo_dir"
  git -C "$repo_dir" init >/dev/null

  if run_capture "$output_file" env \
    HOME="$home_dir" \
    GITFUSE_HOME="$config_dir" \
    GITFUSE_CONFIG_DIR="$config_dir" \
    "$GITFUSE_BIN" -C "$repo_dir" pull; then
    fail "unauthenticated empty-repo pull unexpectedly succeeded"
  else
    status=$?
  fi

  output="$(cat "$output_file")"
  [ "$status" -ne 0 ] || fail "unauthenticated empty-repo pull must exit nonzero"
  assert_contains "$output" "Not authenticated. Run 'gitfuse auth login' first." "unauthenticated empty-repo pull"
  reject_raw_markers "$output" "unauthenticated empty-repo pull"

  log "unauthenticated empty-repo pull exit: $status"
  log "unauthenticated empty-repo pull output begins"
  printf '%s\n' "$output"
  log "unauthenticated empty-repo pull output ends"
}

auth_env() {
  local auth_home="$1"
  shift

  env \
    HOME="$auth_home" \
    GITFUSE_HOME="$auth_home" \
    GITFUSE_CONFIG_DIR="$auth_home" \
    GITFUSE_NONINTERACTIVE=1 \
    "$@"
}

select_authenticated_home() {
  local candidate
  local output_file="$PHASE_TMP/auth-whoami.out"
  local output

  for candidate in "${AUTH_TEST_HOMES[@]}"; do
    [ -d "$candidate" ] || continue
    if auth_env "$candidate" "$GITFUSE_BIN" auth whoami >"$output_file" 2>&1; then
      output="$(cat "$output_file")"
      reject_raw_markers "$output" "authenticated HOME check"
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  fail "SKIP/FAIL: no authenticated test HOME found at ${AUTH_TEST_HOMES[*]}"
}

active_repo_name_from_home() {
  local auth_home="$1"
  local active_file="$auth_home/active_repo"

  if [ -f "$active_file" ]; then
    sed -n 's/^[[:space:]]*name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$active_file" | head -n 1
  fi
}

repo_name_from_repo_list() {
  local auth_home="$1"
  local output_file="$PHASE_TMP/repo-list.out"
  local output

  if ! auth_env "$auth_home" "$GITFUSE_BIN" repo list >"$output_file" 2>&1; then
    output="$(cat "$output_file")"
    reject_raw_markers "$output" "repo list"
    fail "could not list authenticated repositories: $output"
  fi

  output="$(cat "$output_file")"
  reject_raw_markers "$output" "repo list"
  awk 'NR > 1 && NF > 0 {print $1; exit}' "$output_file"
}

select_repo_name() {
  local auth_home="$1"
  local repo_name

  repo_name="$(active_repo_name_from_home "$auth_home")"
  if [ -z "$repo_name" ]; then
    repo_name="$(repo_name_from_repo_list "$auth_home")"
  fi
  if [ -z "$repo_name" ] || [ "$repo_name" = "No" ]; then
    fail "SKIP/FAIL: authenticated HOME has no active or tracked repository"
  fi

  printf '%s\n' "$repo_name"
}

test_authenticated_empty_pull() {
  local auth_home
  local repo_name
  local repo_dir="$PHASE_TMP/auth-empty-repo"
  local output_file="$PHASE_TMP/auth-empty-pull.out"
  local output
  local status

  auth_home="$(select_authenticated_home)"
  repo_name="$(select_repo_name "$auth_home")"
  log "authenticated test HOME: $auth_home"
  log "authenticated repo name: $repo_name"

  mkdir -p "$repo_dir"
  git -C "$repo_dir" init >/dev/null

  if run_capture "$output_file" auth_env "$auth_home" "$GITFUSE_BIN" -C "$repo_dir" pull; then
    fail "authenticated empty-repo pull unexpectedly succeeded"
  else
    status=$?
  fi

  output="$(cat "$output_file")"
  [ "$status" -ne 0 ] || fail "authenticated empty-repo pull must exit nonzero"
  reject_raw_markers "$output" "authenticated empty-repo pull"

  if ! printf '%s' "$output" | grep -F -q -- "This repository has no local commit history" &&
    ! printf '%s' "$output" | grep -F -q -- "local repository is empty"; then
    fail "authenticated empty-repo pull did not include empty-history recovery guidance"
  fi

  if ! printf '%s' "$output" | grep -F -q -- "gitfuse restore $repo_name" &&
    ! printf '%s' "$output" | grep -F -q -- "gitfuse restore <relay-entry-name>"; then
    fail "authenticated empty-repo pull did not include an actionable restore command"
  fi

  log "authenticated empty-repo pull exit: $status"
  log "authenticated empty-repo pull output begins"
  printf '%s\n' "$output"
  log "authenticated empty-repo pull output ends"

  printf 'Phase 56 recovery check\n' >"$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" \
    -c user.name="GitFuse Phase 56" \
    -c user.email="phase56@gitfuse.local" \
    commit -m "phase56 recovery check" >/dev/null
  log "empty git repo remained commit-capable after failed pull"
}

run_dashboard_failure_tests() {
  pnpm --dir "$ROOT/apps/dashboard" exec vitest run "${DASHBOARD_FAILURE_MODE_TESTS[@]}"
}

run_relay_tests() {
  pnpm --dir "$ROOT/relay" test
}

run_relay_build() {
  env NODE_ENV=production pnpm --dir "$ROOT/relay" run build
}

verify_relay_artifact() {
  local dist_dir="$ROOT/relay/dist"

  if [ ! -f "$dist_dir/index.js" ]; then
    fail "missing runnable relay production entrypoint: relay/dist/index.js"
  fi

  (
    cd "$ROOT"
    node --input-type=module -e 'await import("./relay/dist/index.js")'
  )
  log "relay/dist/index.js exists and imports"
}

scan_relay_artifacts() {
  local dist_dir="$ROOT/relay/dist"

  if [ ! -d "$dist_dir" ]; then
    fail "missing relay production artifact directory before artifact scan"
  fi

  node - "$dist_dir" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
const forbidden = [
  { label: "local relay host", value: "localhost:8787" },
  { label: "local relay loopback host", value: "127.0.0.1:8787" },
  { label: "postgres URL scheme", value: "postgres://" },
  { label: "postgresql URL scheme", value: "postgresql://" },
  { label: "DATABASE_URL assignment", value: "DATABASE_URL=" },
  { label: "AUTH_SECRET assignment", value: "AUTH_SECRET=" },
  { label: "NEXTAUTH_SECRET assignment", value: "NEXTAUTH_SECRET=" },
  { label: "GITHUB_CLIENT_SECRET assignment", value: "GITHUB_CLIENT_SECRET=" },
  { label: "GOOGLE_CLIENT_SECRET assignment", value: "GOOGLE_CLIENT_SECRET=" },
  { label: "RAZORPAY_KEY_SECRET assignment", value: "RAZORPAY_KEY_SECRET=" },
  { label: "RAZORPAY_WEBHOOK_SECRET assignment", value: "RAZORPAY_WEBHOOK_SECRET=" },
  { label: "RESEND_API_KEY assignment", value: "RESEND_API_KEY=" },
  { label: "Stripe live secret", value: "sk_live" },
  { label: "Razorpay live key", value: "rk_live" },
  { label: "AWS access key", value: "AKIA" },
];

const forbiddenPatterns = [
  { label: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const files = [];

function walk(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, entry));
    }
    return;
  }

  if (stat.isFile()) files.push(entryPath);
}

walk(root);

if (!files.some((file) => file.endsWith(".js"))) {
  console.error("[phase56] relay artifact scan cannot run because relay/dist has no JavaScript artifacts");
  process.exit(1);
}

const failures = [];

function contextFor(text, index, length) {
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + length + 100);
  return text.slice(start, end).replace(/\s+/g, " ").slice(0, 240);
}

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  for (const entry of forbidden) {
    let index = text.indexOf(entry.value);
    while (index !== -1) {
      failures.push({
        file,
        label: entry.label,
        context: contextFor(text, index, entry.value.length),
      });
      index = text.indexOf(entry.value, index + entry.value.length);
    }
  }

  for (const entry of forbiddenPatterns) {
    const match = entry.pattern.exec(text);
    if (match?.index !== undefined) {
      failures.push({
        file,
        label: entry.label,
        context: contextFor(text, match.index, match[0].length),
      });
    }
  }
}

if (failures.length > 0) {
  console.error("[phase56] relay artifact leak scan failed");
  for (const failure of failures.slice(0, 25)) {
    console.error(`[phase56] forbidden ${failure.label} in ${failure.file}`);
    console.error(`[phase56] context: ${failure.context}`);
  }
  if (failures.length > 25) {
    console.error(`[phase56] ...and ${failures.length - 25} more leak findings`);
  }
  process.exit(1);
}

console.log("[phase56] relay artifact leak scan passed");
NODE
}

main() {
  require_command bash
  require_command git
  require_command go
  require_command node
  require_command pnpm

  cd "$ROOT"
  verify_repo_hygiene "initial"
  verify_no_real_env_files_tracked

  PHASE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-phase56.XXXXXX")"

  log "running CLI Go tests"
  run_cli_tests

  log "building CLI"
  build_cli

  log "testing unauthenticated empty-repo pull"
  test_unauthenticated_empty_pull

  log "testing authenticated empty-repo recovery guidance"
  test_authenticated_empty_pull

  log "running dashboard failure-mode/auth/db tests"
  run_dashboard_failure_tests

  log "running relay tests"
  run_relay_tests

  log "building relay production artifact"
  run_relay_build
  verify_relay_artifact
  scan_relay_artifacts

  rm -rf "$PHASE_TMP"
  PHASE_TMP=""

  verify_repo_hygiene "final"
  log "failure-mode and recovery validation passed"
}

main "$@"
