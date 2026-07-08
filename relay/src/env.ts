import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const relaySourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(relaySourceDir, "../..");

const envCandidates = [
  resolve(repoRoot, "relay/.env.local"),
  resolve(repoRoot, "relay/.env"),
  resolve(repoRoot, "apps/dashboard/.env.local"),
  resolve(repoRoot, "apps/dashboard/.env"),
];

export function loadRelayEnv() {
  for (const path of envCandidates) {
    if (!existsSync(path)) continue;
    applyEnvFile(readFileSync(path, "utf8"));
  }
}

export function applyEnvFile(content: string, target: NodeJS.ProcessEnv = process.env) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    if (target[key] !== undefined) continue;

    target[key] = unquoteEnvValue(match[2].trim());
  }
}

export function assertRelayDatabaseConfiguration() {
  if (process.env.DATABASE_URL?.trim()) return;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.GITFUSE_ALLOW_IN_MEMORY_RELAY === "1"
  ) {
    return;
  }

  throw new Error(
    [
      "DATABASE_URL is required for the GitFuse relay server.",
      "The dashboard reads persisted data from Postgres; running the relay without DATABASE_URL would create a separate in-memory device store.",
      "Set DATABASE_URL for production, or set GITFUSE_ALLOW_IN_MEMORY_RELAY=1 only for isolated non-production tests.",
    ].join(" "),
  );
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

if (process.env.NODE_ENV !== "test") {
  loadRelayEnv();
}
