#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/piyush/Desktop/GitFuse"
RELAY_DIR="$ROOT/relay"
PHASE_TMP=""
PROD_WORKTREE=""

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

FORBIDDEN_RELAY_ENV_FILES=(
  "relay/.env"
  "relay/.env.local"
  "relay/.dev.vars"
  "relay/.env.production"
)

log() {
  printf '[phase55] %s\n' "$*"
}

fail() {
  printf '[phase55] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${PROD_WORKTREE:-}" ] && [ -e "$PROD_WORKTREE/.git" ]; then
    git -C "$ROOT" worktree remove --force "$PROD_WORKTREE" >/dev/null 2>&1 || true
  fi

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

verify_relay_env_files() {
  local root="$1"

  if ! git -C "$root" ls-files --error-unmatch "relay/.env.example" >/dev/null 2>&1; then
    fail "relay/.env.example must remain tracked as the allowed example env file"
  fi
  log "relay/.env.example is tracked and allowed"

  for env_file in "${FORBIDDEN_RELAY_ENV_FILES[@]}"; do
    if git -C "$root" ls-files --error-unmatch "$env_file" >/dev/null 2>&1; then
      fail "$env_file must not be committed"
    fi

    if [ -e "$root/$env_file" ]; then
      fail "$env_file must not be present for production validation"
    fi
  done
}

run_relay_typecheck() {
  pnpm --dir "$1/relay" run typecheck
}

run_relay_tests() {
  pnpm --dir "$1/relay" test
}

run_relay_build() {
  env NODE_ENV=production pnpm --dir "$1/relay" run build
}

install_worktree_dependencies() {
  env NODE_ENV=development pnpm --dir "$1" install --offline --frozen-lockfile --prod=false
}

verify_relay_artifact() {
  local root="$1"
  local dist_dir="$root/relay/dist"

  if [ ! -d "$dist_dir" ]; then
    fail "missing relay production artifact directory: relay/dist"
  fi

  if [ ! -f "$dist_dir/index.js" ]; then
    fail "missing runnable relay production entrypoint: relay/dist/index.js"
  fi

  if [ -z "$(find "$dist_dir" -type f -name '*.js' -print -quit)" ]; then
    fail "relay/dist exists but contains no JavaScript artifacts"
  fi

  (
    cd "$root"
    node --input-type=module -e 'await import("./relay/dist/index.js")'
  )
  log "relay/dist contains runnable JavaScript artifacts"
}

scan_relay_artifacts() {
  local root="$1"
  local dist_dir="$root/relay/dist"

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
  console.error("[phase55] relay artifact scan cannot run because relay/dist has no JavaScript artifacts");
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
  console.error("[phase55] relay artifact leak scan failed");
  for (const failure of failures.slice(0, 25)) {
    console.error(`[phase55] forbidden ${failure.label} in ${failure.file}`);
    console.error(`[phase55] context: ${failure.context}`);
  }
  if (failures.length > 25) {
    console.error(`[phase55] ...and ${failures.length - 25} more leak findings`);
  }
  process.exit(1);
}

console.log("[phase55] relay artifact leak scan passed");
NODE
}

main() {
  cd "$ROOT"

  require_command git
  require_command node
  require_command pnpm

  verify_repo_hygiene "initial"
  verify_relay_env_files "$ROOT"

  log "running relay typecheck"
  run_relay_typecheck "$ROOT"

  log "running relay tests"
  run_relay_tests "$ROOT"

  log "building relay production artifact in current worktree"
  run_relay_build "$ROOT"
  verify_relay_artifact "$ROOT"
  scan_relay_artifacts "$ROOT"

  PHASE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-phase55-relay.XXXXXX")"
  PROD_WORKTREE="$PHASE_TMP/worktree"

  log "creating clean relay production worktree from HEAD"
  git -C "$ROOT" worktree add --detach "$PROD_WORKTREE" HEAD
  verify_relay_env_files "$PROD_WORKTREE"

  log "installing clean worktree build dependencies"
  install_worktree_dependencies "$PROD_WORKTREE"

  log "running relay typecheck in clean worktree"
  run_relay_typecheck "$PROD_WORKTREE"

  log "running relay tests in clean worktree"
  run_relay_tests "$PROD_WORKTREE"

  log "building relay production artifact in clean worktree"
  run_relay_build "$PROD_WORKTREE"
  verify_relay_artifact "$PROD_WORKTREE"
  scan_relay_artifacts "$PROD_WORKTREE"

  git -C "$ROOT" worktree remove --force "$PROD_WORKTREE"
  PROD_WORKTREE=""
  rm -rf "$PHASE_TMP"
  PHASE_TMP=""

  verify_repo_hygiene "final"
  log "relay production build validation passed"
}

main "$@"
