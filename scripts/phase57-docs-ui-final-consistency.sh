#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_DIR="$ROOT/apps/dashboard"
PHASE54_SCRIPT="$ROOT/scripts/phase54-dashboard-production-build.sh"
PHASE_TMP=""
RUNTIME_WORKTREE=""
SERVER_PID=""

REQUIRED_ROUTE_FILES=(
  "app/page.tsx"
  "app/docs/page.tsx"
  "app/(auth)/login/page.tsx"
  "app/(auth)/cli-auth/page.tsx"
  "app/(dashboard)/dashboard/page.tsx"
  "app/(dashboard)/dashboard/repos/page.tsx"
  "app/(dashboard)/dashboard/devices/page.tsx"
  "app/(dashboard)/dashboard/history/page.tsx"
  "app/(dashboard)/dashboard/usage/page.tsx"
  "app/(dashboard)/dashboard/settings/page.tsx"
  "app/(dashboard)/dashboard/upgrade/page.tsx"
)

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
  "?? scripts/phase57-docs-ui-final-consistency.sh"
)

PROD_ENV=(
  "NODE_ENV=production"
  "NEXT_TELEMETRY_DISABLED=1"
  "DATABASE_URL=postgresql://gitfuse_phase57:gitfuse_phase57@db.internal:5432/gitfuse_phase57"
  "AUTH_URL=https://dashboard.gitfuse.dev"
  "NEXTAUTH_URL=https://dashboard.gitfuse.dev"
  "NEXT_PUBLIC_APP_URL=https://dashboard.gitfuse.dev"
  "AUTH_SECRET=phase57-private-auth-secret"
  "NEXTAUTH_SECRET=phase57-private-nextauth-secret"
  "GITFUSE_RELAY_URL=https://relay.gitfuse.dev"
  "RELAY_URL=https://relay.gitfuse.dev"
  "GITHUB_CLIENT_ID=phase57-github-client"
  "GITHUB_CLIENT_SECRET=phase57-private-github-secret"
  "GOOGLE_CLIENT_ID=phase57-google-client"
  "GOOGLE_CLIENT_SECRET=phase57-private-google-secret"
  "EMAIL_PROVIDER=resend"
  "RESEND_API_KEY=phase57-private-resend-secret"
  "RESEND_FROM_EMAIL=GitFuse <notifications@gitfuse.dev>"
  "PAYMENT_PROVIDER=razorpay"
  "RAZORPAY_KEY_ID=rzp_live_phase57_public"
  "NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_phase57_public"
  "RAZORPAY_KEY_SECRET=phase57-private-razorpay-secret"
  "RAZORPAY_WEBHOOK_SECRET=phase57-private-razorpay-webhook-secret"
  "RAZORPAY_PRO_PLAN_ID=plan_phase57_pro"
  "RAZORPAY_TEAM_PLAN_ID=plan_phase57_team"
  "PAIRING_PIN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef"
)

SMOKE_ROUTES=(
  "/"
  "/docs"
  "/login"
  "/dashboard"
  "/dashboard/settings?section=billing"
  "/dashboard/upgrade"
)

log() {
  printf '[phase57] %s\n' "$*"
}

fail() {
  printf '[phase57] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  if [ -n "${RUNTIME_WORKTREE:-}" ] && [ -e "$RUNTIME_WORKTREE/.git" ]; then
    git -C "$ROOT" worktree remove --force "$RUNTIME_WORKTREE" >/dev/null 2>&1 || true
  fi

  if [ -n "${PHASE_TMP:-}" ] && [ -d "$PHASE_TMP" ]; then
    rm -rf "$PHASE_TMP"
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

run_prod_env() {
  env "${PROD_ENV[@]}" "$@"
}

run_test_env() {
  env \
    "NODE_ENV=test" \
    "NEXT_TELEMETRY_DISABLED=1" \
    "AUTH_SECRET=phase57-test-auth-secret" \
    "NEXTAUTH_SECRET=phase57-test-nextauth-secret" \
    "AUTH_URL=http://localhost:3000" \
    "NEXTAUTH_URL=http://localhost:3000" \
    "NEXT_PUBLIC_APP_URL=http://localhost:3000" \
    "PAIRING_PIN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef" \
    "EMAIL_PROVIDER=" \
    "RESEND_API_KEY=" \
    "RESEND_FROM_EMAIL=" \
    "PAYMENT_PROVIDER=" \
    "RAZORPAY_KEY_ID=" \
    "RAZORPAY_KEY_SECRET=" \
    "RAZORPAY_WEBHOOK_SECRET=" \
    "RAZORPAY_PRO_PLAN_ID=" \
    "RAZORPAY_TEAM_PLAN_ID=" \
    "NEXT_PUBLIC_RAZORPAY_KEY_ID=" \
    "$@"
}

is_allowed_status_line() {
  local line="$1"
  local allowed

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

assert_file_contains() {
  local file="$1"
  local needle="$2"
  local label="$3"

  if ! grep -F -q -- "$needle" "$file"; then
    fail "$label missing expected text: $needle"
  fi
}

verify_route_files() {
  local route_file
  local standalone_billing_route="$DASHBOARD_DIR/app/(dashboard)/dashboard/billing/page.tsx"

  for route_file in "${REQUIRED_ROUTE_FILES[@]}"; do
    [ -f "$DASHBOARD_DIR/$route_file" ] || fail "required route file missing: $route_file"
    log "route file present: $route_file"
  done

  if [ -f "$standalone_billing_route" ]; then
    log "standalone billing route exists but is not required by Phase 57"
  else
    log "standalone billing route is intentionally not required: app/(dashboard)/dashboard/billing/page.tsx"
  fi
}

verify_billing_upgrade_links() {
  local layout_file="$DASHBOARD_DIR/app/(dashboard)/components/layout/dashboard-layout.tsx"
  local settings_file="$DASHBOARD_DIR/app/(dashboard)/dashboard/settings/page.tsx"
  local upgrade_file="$DASHBOARD_DIR/app/(dashboard)/dashboard/upgrade/page.tsx"

  assert_file_contains "$layout_file" 'href="/dashboard/settings?section=billing"' "dashboard layout billing link"
  assert_file_contains "$layout_file" '<span>Billing</span>' "dashboard layout billing label"
  assert_file_contains "$layout_file" 'href="/dashboard/upgrade"' "dashboard layout upgrade link"
  assert_file_contains "$layout_file" '<span>Upgrade plan</span>' "dashboard layout upgrade label"

  assert_file_contains "$settings_file" 'normalized === "billing"' "settings billing query recognition"
  assert_file_contains "$settings_file" 'return "Billing"' "settings billing section mapping"
  assert_file_contains "$settings_file" "function BillingSection" "settings billing section"
  assert_file_contains "$settings_file" 'href="/dashboard/upgrade"' "settings billing upgrade path"

  assert_file_contains "$upgrade_file" 'href="/dashboard/settings?section=billing"' "upgrade billing-settings backlink"

  log "billing surface confirmed at /dashboard/settings?section=billing"
  log "upgrade route confirmed at /dashboard/upgrade"
}

run_dashboard_typecheck_and_tests() {
  log "running dashboard typecheck"
  run_test_env pnpm --dir "$DASHBOARD_DIR" run typecheck

  log "running dashboard tests"
  run_test_env pnpm --dir "$DASHBOARD_DIR" run test
}

run_phase54() {
  if [ ! -f "$PHASE54_SCRIPT" ]; then
    fail "Phase 54 production build script is missing: scripts/phase54-dashboard-production-build.sh"
  fi

  log "running Phase 54 dashboard production build via bash"
  bash "$PHASE54_SCRIPT"
  log "Phase 54 dashboard production build reuse passed"
}

find_free_port() {
  node - <<'NODE'
const server = require("node:net").createServer();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(address.port);
  server.close();
});
NODE
}

wait_for_server() {
  local port="$1"
  local attempts=0

  while [ "$attempts" -lt 60 ]; do
    if curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1; then
      return 0
    fi

    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      cat "$PHASE_TMP/next-start.log" >&2 || true
      fail "next start exited before becoming ready"
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  cat "$PHASE_TMP/next-start.log" >&2 || true
  fail "next start did not become ready"
}

route_slug() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9' '_'
}

is_login_url() {
  local url="$1"

  case "$url" in
    *"/login"|*"/login?"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

scan_rendered_html() {
  local label="$1"
  local file="$2"

  run_prod_env node - "$label" "$file" <<'NODE'
const fs = require("node:fs");

const label = process.argv[2];
const file = process.argv[3];
const html = fs.readFileSync(file, "utf8");

const secretEnvNames = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

const forbiddenExact = [
  { label: "local relay URL", value: "http://localhost:8787" },
  { label: "local relay loopback URL", value: "http://127.0.0.1:8787" },
  { label: "local relay host", value: "localhost:8787" },
  { label: "local relay loopback host", value: "127.0.0.1:8787" },
  ...secretEnvNames
    .map((name) => ({ label: `${name} value`, value: process.env[name] }))
    .filter((entry) => entry.value && entry.value.trim().length > 0),
];

const failures = [];

function contextAt(index, length) {
  const start = Math.max(0, index - 100);
  const end = Math.min(html.length, index + length + 100);
  return html.slice(start, end).replace(/\s+/g, " ").slice(0, 240);
}

for (const entry of forbiddenExact) {
  let index = html.indexOf(entry.value);
  while (index !== -1) {
    failures.push({
      label: entry.label,
      context: contextAt(index, entry.value.length),
    });
    index = html.indexOf(entry.value, index + entry.value.length);
  }
}

const brokenHrefPatterns = [
  { label: "placeholder href", regex: /href\s*=\s*["']#["']/gi },
  { label: "javascript href", regex: /href\s*=\s*["']javascript:/gi },
];

for (const entry of brokenHrefPatterns) {
  for (const match of html.matchAll(entry.regex)) {
    failures.push({
      label: entry.label,
      context: contextAt(match.index ?? 0, match[0].length),
    });
  }
}

if (failures.length > 0) {
  console.error(`[phase57] rendered HTML scan failed for ${label}`);
  for (const failure of failures.slice(0, 20)) {
    console.error(`[phase57] forbidden ${failure.label}`);
    console.error(`[phase57] context: ${failure.context}`);
  }
  if (failures.length > 20) {
    console.error(`[phase57] ...and ${failures.length - 20} more rendered HTML findings`);
  }
  process.exit(1);
}

console.log(`[phase57] rendered HTML scan passed for ${label}`);
NODE
}

smoke_route() {
  local port="$1"
  local route="$2"
  local output="$PHASE_TMP/runtime-$(route_slug "$route").html"
  local metadata
  local status
  local final_url
  local route_path="${route%%\?*}"

  metadata="$(
    curl -sS -L \
      -o "$output" \
      -w '%{http_code} %{url_effective}' \
      "http://127.0.0.1:$port$route"
  )"
  status="${metadata%% *}"
  final_url="${metadata#* }"

  if [ "$status" != "200" ]; then
    fail "$route expected HTTP 200 after redirects, got status=$status final_url=$final_url"
  fi

  case "$route" in
    "/dashboard")
      if ! is_login_url "$final_url"; then
        fail "$route expected a protected-route redirect to /login, got final_url=$final_url"
      fi
      log "smoke $route accepted protected redirect final_url=$final_url"
      ;;
    "/dashboard/settings?section=billing"|"/dashboard/upgrade")
      if is_login_url "$final_url"; then
        log "smoke $route accepted protected redirect final_url=$final_url"
      elif printf '%s' "$final_url" | grep -F -q -- "$route_path"; then
        log "smoke $route accepted successful render final_url=$final_url"
      else
        fail "$route expected /login redirect or successful render, got final_url=$final_url"
      fi
      ;;
    *)
      if is_login_url "$final_url" && [ "$route" != "/login" ]; then
        fail "$route unexpectedly redirected to login: final_url=$final_url"
      fi
      log "smoke $route status=$status final_url=$final_url"
      ;;
  esac

  scan_rendered_html "$route" "$output"
}

run_runtime_smoke() {
  local port
  local route

  PHASE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-phase57-docs-ui.XXXXXX")"
  RUNTIME_WORKTREE="$PHASE_TMP/worktree"

  log "creating clean runtime smoke worktree from HEAD"
  git -C "$ROOT" worktree add --detach "$RUNTIME_WORKTREE" HEAD

  log "installing runtime smoke dependencies offline"
  env NODE_ENV=development pnpm --dir "$RUNTIME_WORKTREE" install --offline --frozen-lockfile --prod=false

  log "building dashboard before next start"
  run_prod_env pnpm --dir "$RUNTIME_WORKTREE/apps/dashboard" exec next build

  if [ ! -f "$RUNTIME_WORKTREE/apps/dashboard/.next/BUILD_ID" ]; then
    fail "production build did not produce apps/dashboard/.next/BUILD_ID"
  fi
  log "production build exists; starting next start is now allowed"

  port="$(find_free_port)"
  log "starting production dashboard on 127.0.0.1:$port"
  (
    cd "$RUNTIME_WORKTREE/apps/dashboard"
    run_prod_env pnpm exec next start --hostname 127.0.0.1 --port "$port"
  ) >"$PHASE_TMP/next-start.log" 2>&1 &
  SERVER_PID="$!"

  wait_for_server "$port"

  for route in "${SMOKE_ROUTES[@]}"; do
    smoke_route "$port" "$route"
  done

  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  SERVER_PID=""

  git -C "$ROOT" worktree remove --force "$RUNTIME_WORKTREE"
  RUNTIME_WORKTREE=""
  rm -rf "$PHASE_TMP"
  PHASE_TMP=""

  log "runtime smoke passed"
}

main() {
  cd "$ROOT"

  require_command bash
  require_command curl
  require_command git
  require_command node
  require_command pnpm

  verify_repo_hygiene "initial"
  verify_route_files
  verify_billing_upgrade_links
  run_dashboard_typecheck_and_tests
  run_phase54
  run_runtime_smoke
  verify_repo_hygiene "final"

  log "docs/UI final consistency validation passed"
}

main "$@"
