#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/piyush/Desktop/GitFuse"
DASHBOARD_DIR="$ROOT/apps/dashboard"
TEST_DATABASE_URL_VALUE="${TEST_DATABASE_URL:-postgresql://localhost:5432/gitfuse_db}"

TARGETED_TESTS=(
  "auth.callbacks.test.ts"
  "auth.oauth.spec.ts"
  "auth.email-otp.spec.ts"
  "auth.cli-pair.spec.ts"
  "dashboard.route-guard.spec.ts"
  "billing.price.spec.ts"
  "lib/db.test.ts"
  "lib/migrations.test.ts"
)

PROD_ENV=(
  "NODE_ENV=production"
  "NEXT_TELEMETRY_DISABLED=1"
  "DATABASE_URL=postgresql://gitfuse_build:gitfuse_build@db.internal:5432/gitfuse_build"
  "AUTH_URL=https://dashboard.gitfuse.dev"
  "NEXTAUTH_URL=https://dashboard.gitfuse.dev"
  "NEXT_PUBLIC_APP_URL=https://dashboard.gitfuse.dev"
  "AUTH_SECRET=phase54-private-auth-secret"
  "NEXTAUTH_SECRET=phase54-private-nextauth-secret"
  "GITFUSE_RELAY_URL=https://relay.gitfuse.dev"
  "RELAY_URL=https://relay.gitfuse.dev"
  "GITHUB_CLIENT_ID=phase54-github-client"
  "GITHUB_CLIENT_SECRET=phase54-private-github-secret"
  "GOOGLE_CLIENT_ID=phase54-google-client"
  "GOOGLE_CLIENT_SECRET=phase54-private-google-secret"
  "EMAIL_PROVIDER=resend"
  "RESEND_API_KEY=phase54-private-resend-secret"
  "RESEND_FROM_EMAIL=GitFuse <notifications@gitfuse.dev>"
  "PAYMENT_PROVIDER=razorpay"
  "RAZORPAY_KEY_ID=rzp_live_phase54_public"
  "NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_phase54_public"
  "RAZORPAY_KEY_SECRET=phase54-private-razorpay-secret"
  "RAZORPAY_WEBHOOK_SECRET=phase54-private-razorpay-webhook-secret"
  "RAZORPAY_PRO_PLAN_ID=plan_phase54_pro"
  "RAZORPAY_TEAM_PLAN_ID=plan_phase54_team"
  "PAIRING_PIN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef"
)

PHASE_TMP=""
PROD_WORKTREE=""
SERVER_PID=""

log() {
  printf '[phase54] %s\n' "$*"
}

fail() {
  printf '[phase54] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  if [ -n "${PROD_WORKTREE:-}" ] && [ -e "$PROD_WORKTREE/.git" ]; then
    git -C "$ROOT" worktree remove --force "$PROD_WORKTREE" >/dev/null 2>&1 || true
  fi

  if [ -n "${PHASE_TMP:-}" ] && [ -d "$PHASE_TMP" ]; then
    rm -rf "$PHASE_TMP"
  fi
}

trap cleanup EXIT INT TERM

run_test_env() {
  env \
    "NODE_ENV=test" \
    "NEXT_TELEMETRY_DISABLED=1" \
    "TEST_DATABASE_URL=$TEST_DATABASE_URL_VALUE" \
    "DATABASE_URL=$TEST_DATABASE_URL_VALUE" \
    "AUTH_SECRET=phase54-test-auth-secret" \
    "NEXTAUTH_SECRET=phase54-test-nextauth-secret" \
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

run_prod_env() {
  env "${PROD_ENV[@]}" "$@"
}

verify_repo_hygiene() {
  local label="$1"

  log "$label repo status:"
  git -C "$ROOT" status --short
  git -C "$ROOT" diff --check
  git -C "$ROOT" diff --cached --check

  if ! git -C "$ROOT" diff --quiet; then
    fail "$label repo hygiene failed: tracked files have unstaged changes"
  fi

  if ! git -C "$ROOT" diff --cached --quiet; then
    fail "$label repo hygiene failed: staged changes are present"
  fi

  if git -C "$ROOT" ls-files --error-unmatch "apps/dashboard/.env.local" >/dev/null 2>&1; then
    fail "apps/dashboard/.env.local is committed"
  fi

  if [ -n "$(git -C "$ROOT" diff --cached --name-only -- 'apps/dashboard/.next' 2>/dev/null)" ]; then
    fail "apps/dashboard/.next must not be staged"
  fi
}

scan_for_leaks() {
  local mode="$1"
  shift

  run_prod_env node - "$mode" "$@" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const mode = process.argv[2];
const roots = process.argv.slice(3);

const privateEnvNames = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

const privateEnvValues = privateEnvNames
  .map((name) => ({ label: `${name} value`, value: process.env[name] }))
  .filter((entry) => entry.value && entry.value.trim().length > 0);

const forbiddenExact = [
  { label: "local relay host", value: "localhost:8787" },
  { label: "local relay loopback host", value: "127.0.0.1:8787" },
  {
    label: "local relay env assignment",
    value: "GITFUSE_RELAY_URL=http://localhost:8787",
  },
  {
    label: "local public app env assignment",
    value: "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  },
  { label: "localhost https URL", value: "https://localhost" },
  { label: "loopback http URL", value: "http://127.0.0.1" },
  { label: "postgres URL scheme", value: "postgres://" },
  { label: "postgresql URL scheme", value: "postgresql://" },
  { label: "NEXT_PUBLIC_APP_URL env name", value: "NEXT_PUBLIC_APP_URL" },
  ...privateEnvNames.map((value) => ({
    label: `${value} env name`,
    value,
  })),
  ...privateEnvValues,
];

const failures = [];
const allowed = [];
const seenAllowed = new Set();

function listFiles(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function contextFor(text, index, length) {
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + length + 120);
  return text
    .slice(start, end)
    .replace(/\s+/g, " ")
    .slice(0, 260);
}

function addFailure(file, label, index, value, text) {
  failures.push({
    file,
    label,
    context: contextFor(text, index, value.length),
  });
}

function addAllowed(file, label, index, value, text) {
  const key = `${file}:${label}:${index}`;
  if (seenAllowed.has(key)) return;
  seenAllowed.add(key);
  allowed.push({
    file,
    label,
    context: contextFor(text, index, value.length),
  });
}

function allowedLocalhostContext(text, index) {
  const authDefault = "http://localhost:3000/api/auth";
  const authIndex = text.lastIndexOf(authDefault, index);
  if (authIndex >= 0 && index < authIndex + authDefault.length) {
    return { label: "auth-library default", value: authDefault, index: authIndex };
  }

  const context = contextFor(text, index, "localhost".length);
  if (/(URL|url|Url|hostname|host|origin|protocol|slashesDenoteHost)/.test(context)) {
    return { label: "URL/polyfill literal", value: "localhost", index };
  }

  return null;
}

function scanText(file, text) {
  for (const entry of forbiddenExact) {
    if (entry.value === "http://localhost:3000") continue;

    let index = text.indexOf(entry.value);
    while (index !== -1) {
      addFailure(file, entry.label, index, entry.value, text);
      index = text.indexOf(entry.value, index + entry.value.length);
    }
  }

  const localAppUrl = "http://localhost:3000";
  let appIndex = text.indexOf(localAppUrl);
  while (appIndex !== -1) {
    const allowedAuthDefault = "http://localhost:3000/api/auth";
    if (text.startsWith(allowedAuthDefault, appIndex)) {
      addAllowed(file, "auth-library default", appIndex, allowedAuthDefault, text);
    } else {
      addFailure(file, "local app public URL", appIndex, localAppUrl, text);
    }
    appIndex = text.indexOf(localAppUrl, appIndex + localAppUrl.length);
  }

  let localIndex = text.indexOf("localhost");
  while (localIndex !== -1) {
    const allowedContext = allowedLocalhostContext(text, localIndex);
    if (allowedContext) {
      addAllowed(
        file,
        allowedContext.label,
        allowedContext.index,
        allowedContext.value,
        text,
      );
    } else {
      addFailure(file, "unclassified localhost literal", localIndex, "localhost", text);
    }
    localIndex = text.indexOf("localhost", localIndex + "localhost".length);
  }
}

for (const root of roots) {
  for (const file of listFiles(root)) {
    const text = fs.readFileSync(file).toString("utf8");
    scanText(file, text);
  }
}

if (failures.length > 0) {
  console.error(`[phase54] ${mode} leak scan failed`);
  for (const failure of failures.slice(0, 25)) {
    console.error(`[phase54] forbidden ${failure.label} in ${failure.file}`);
    console.error(`[phase54] context: ${failure.context}`);
  }
  if (failures.length > 25) {
    console.error(`[phase54] ...and ${failures.length - 25} more leak findings`);
  }
  process.exit(1);
}

if (allowed.length > 0) {
  for (const entry of allowed) {
    console.log(`[phase54] allowed ${mode} literal: ${entry.label} in ${entry.file}`);
    console.log(`[phase54] evidence: ${entry.context}`);
  }
} else {
  console.log(`[phase54] ${mode} leak scan found no localhost literals`);
}

console.log(`[phase54] ${mode} leak scan passed`);
NODE
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

smoke_route() {
  local port="$1"
  local route="$2"
  local output="$PHASE_TMP/runtime-${route//\//_}.html"
  local metadata
  local status
  local final_url

  metadata="$(
    curl -sS -L \
      -o "$output" \
      -w '%{http_code} %{url_effective}' \
      "http://127.0.0.1:$port$route"
  )"
  status="${metadata%% *}"
  final_url="${metadata#* }"

  case "$route" in
    "/dashboard")
      if [ "$status" != "200" ] || ! printf '%s' "$final_url" | grep -q '/login'; then
        fail "$route expected an auth redirect to /login, got status=$status final_url=$final_url"
      fi
      ;;
    *)
      if [ "$status" != "200" ]; then
        fail "$route expected HTTP 200, got status=$status final_url=$final_url"
      fi
      ;;
  esac

  log "smoke $route status=$status final_url=$final_url"
  scan_for_leaks "runtime HTML $route" "$output"
}

main() {
  cd "$ROOT"

  require_command git
  require_command pnpm
  require_command node
  require_command curl

  verify_repo_hygiene "initial"

  log "running dashboard typecheck under local test env"
  run_test_env pnpm --dir "$DASHBOARD_DIR" exec tsc --noEmit

  log "running targeted dashboard tests under local test env"
  run_test_env pnpm --dir "$DASHBOARD_DIR" exec vitest run "${TARGETED_TESTS[@]}"

  PHASE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/gitfuse-phase54-dashboard.XXXXXX")"
  PROD_WORKTREE="$PHASE_TMP/worktree"

  log "creating clean production worktree from HEAD"
  git -C "$ROOT" worktree add --detach "$PROD_WORKTREE" HEAD

  if [ -e "$PROD_WORKTREE/apps/dashboard/.env.local" ]; then
    fail "apps/dashboard/.env.local is present in the clean production worktree"
  fi
  log "confirmed apps/dashboard/.env.local is absent from the production worktree"

  log "installing production worktree dependencies with pnpm offline/frozen"
  pnpm --dir "$PROD_WORKTREE" install --offline --frozen-lockfile

  log "building dashboard with explicit production-like env"
  run_prod_env pnpm --dir "$PROD_WORKTREE/apps/dashboard" exec next build

  if [ -e "$PROD_WORKTREE/apps/dashboard/.env.local" ]; then
    fail "apps/dashboard/.env.local appeared in the production worktree"
  fi

  if [ -n "$(find "$PROD_WORKTREE/apps/dashboard/.next" -name ".env.local" -print -quit)" ]; then
    fail ".env.local was copied into the dashboard build output"
  fi
  log "confirmed .env.local is absent from dashboard build output"

  log "scanning client static bundle for local URL and secret leakage"
  scan_for_leaks "client bundle" "$PROD_WORKTREE/apps/dashboard/.next/static"

  local port
  port="$(find_free_port)"
  log "starting production dashboard on 127.0.0.1:$port"
  (
    cd "$PROD_WORKTREE/apps/dashboard"
    run_prod_env pnpm exec next start --hostname 127.0.0.1 --port "$port"
  ) >"$PHASE_TMP/next-start.log" 2>&1 &
  SERVER_PID="$!"

  wait_for_server "$port"

  smoke_route "$port" "/"
  smoke_route "$port" "/docs"
  smoke_route "$port" "/login"
  smoke_route "$port" "/dashboard"

  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  SERVER_PID=""

  git -C "$ROOT" worktree remove --force "$PROD_WORKTREE"
  PROD_WORKTREE=""
  rm -rf "$PHASE_TMP"
  PHASE_TMP=""

  verify_repo_hygiene "final"
  log "dashboard production build validation passed"
}

main "$@"
