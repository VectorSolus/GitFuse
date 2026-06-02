import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Bundle,
  BundleStatus,
  Device,
  Repository,
  SyncEvent,
  SyncEventType
} from "@gitfuse/types/workspace";
import type { PlanTier, UsageSummary } from "@gitfuse/types/billing";

export type AuthenticatedDevice = {
  tokenHash: string;
  userId: string;
  deviceId: string;
  username: string;
};

type UserRecord = {
  id: string;
  githubUsername: string;
  email: string;
  tier: PlanTier;
};

type AuthSession = {
  id: string;
  code: string;
  userId: string | null;
  deviceName: string;
  approvedAt: string | null;
  expiresAt: string;
  createdAt: string;
  token: string | null;
};

const users = new Map<string, UserRecord>();
const devices = new Map<string, Device & { tokenHash: string; token: string }>();
const repositories = new Map<string, Repository>();
const bundles = new Map<string, Bundle>();
const syncEvents: SyncEvent[] = [];
const authSessions = new Map<string, AuthSession>();

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function relayEntryId(displayName: string) {
  return `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${randomUUID()}`;
}

export async function authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
  const tokenHash = hashToken(token);
  for (const device of devices.values()) {
    if (device.tokenHash === tokenHash && device.revokedAt === null) {
      device.lastActiveAt = nowIso();
      const user = users.get(device.userId);
      return user
        ? { tokenHash, userId: device.userId, deviceId: device.id, username: user.githubUsername }
        : null;
    }
  }
  return null;
}

export async function createAuthSession(code: string, deviceName: string) {
  const session: AuthSession = {
    id: randomUUID(),
    code,
    userId: null,
    deviceName,
    approvedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
    token: null
  };
  authSessions.set(code, session);
  return session;
}

export async function approveAuthSession(code: string, githubUsername: string, email = `${githubUsername}@users.noreply.github.com`) {
  const session = authSessions.get(code);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;

  let user = [...users.values()].find((record) => record.githubUsername === githubUsername);
  if (!user) {
    user = { id: randomUUID(), githubUsername, email, tier: "free" };
    users.set(user.id, user);
  }

  const token = `gf_${randomBytes(32).toString("base64url")}`;
  const device: Device & { tokenHash: string; token: string } = {
    id: randomUUID(),
    userId: user.id,
    name: session.deviceName,
    tokenHash: hashToken(token),
    token,
    lastActiveAt: nowIso(),
    createdAt: nowIso(),
    revokedAt: null
  };
  devices.set(device.id, device);

  session.userId = user.id;
  session.approvedAt = nowIso();
  session.token = token;
  return { session, user, token };
}

export async function pollAuthSession(code: string) {
  const session = authSessions.get(code);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  if (!session.approvedAt || !session.userId || !session.token) return { approved: false as const };
  const user = users.get(session.userId);
  return { approved: true as const, token: session.token, username: user?.githubUsername ?? "" };
}

export async function listRepos(userId: string) {
  return [...repositories.values()].filter((repo) => repo.userId === userId);
}

export async function createRepo(userId: string, input: { rootSha: string; displayName: string; remoteUrl?: string | null }) {
  const duplicate = [...repositories.values()].find((repo) => repo.userId === userId && repo.rootSha === input.rootSha);
  if (duplicate) return duplicate;

  const repo: Repository = {
    id: randomUUID(),
    userId,
    rootSha: input.rootSha,
    displayName: input.displayName,
    remoteUrl: input.remoteUrl ?? null,
    relayEntryId: relayEntryId(input.displayName),
    createdAt: nowIso(),
    lastSyncedAt: null
  };
  repositories.set(repo.id, repo);
  return repo;
}

export async function deleteRepo(userId: string, relayEntryIdValue: string) {
  const repo = [...repositories.values()].find((item) => item.userId === userId && item.relayEntryId === relayEntryIdValue);
  if (!repo) return false;
  repositories.delete(repo.id);
  return true;
}

export async function findRepoByRelayEntry(userId: string, relayEntryIdValue: string) {
  return [...repositories.values()].find((repo) => repo.userId === userId && repo.relayEntryId === relayEntryIdValue) ?? null;
}

export async function createBundle(input: {
  repositoryId: string;
  deviceId: string;
  bundleHash: string;
  commitCount: number;
  sizeBytes: number;
  r2Key: string;
  parentBundleId?: string | null;
  expiresAt: string;
}) {
  const bundle: Bundle = {
    id: randomUUID(),
    repositoryId: input.repositoryId,
    deviceId: input.deviceId,
    bundleHash: input.bundleHash,
    commitCount: input.commitCount,
    sizeBytes: input.sizeBytes,
    r2Key: input.r2Key,
    status: "active",
    parentBundleId: input.parentBundleId ?? null,
    createdAt: nowIso(),
    expiresAt: input.expiresAt
  };
  bundles.set(bundle.id, bundle);
  return bundle;
}

export async function listBundles(repositoryId: string) {
  return [...bundles.values()].filter((bundle) => bundle.repositoryId === repositoryId && bundle.status === "active");
}

export async function findBundle(bundleId: string) {
  return bundles.get(bundleId) ?? null;
}

export async function updateBundleStatus(bundleId: string, status: BundleStatus) {
  const bundle = bundles.get(bundleId);
  if (!bundle) return null;
  const updated = { ...bundle, status };
  bundles.set(bundleId, updated);
  return updated;
}

export async function recordSyncEvent(input: {
  repositoryId: string;
  deviceId: string;
  eventType: SyncEventType;
  commitCount: number;
  bundleSizeBytes: number;
}) {
  const event: SyncEvent = { id: randomUUID(), createdAt: nowIso(), ...input };
  syncEvents.push(event);
  return event;
}

export async function listDevices(userId: string) {
  return [...devices.values()]
    .filter((device) => device.userId === userId)
    .map(({ tokenHash: _tokenHash, token: _token, ...device }) => device);
}

export async function revokeDevice(userId: string, deviceId: string) {
  const device = devices.get(deviceId);
  if (!device || device.userId !== userId) return false;
  device.revokedAt = nowIso();
  return true;
}

export async function getUsage(userId: string): Promise<UsageSummary> {
  const user = users.get(userId);
  const userRepos = await listRepos(userId);
  const userDevices = await listDevices(userId);
  const repositoryIds = new Set(userRepos.map((repo) => repo.id));
  const storageBytes = [...bundles.values()]
    .filter((bundle) => repositoryIds.has(bundle.repositoryId) && bundle.status === "active")
    .reduce((total, bundle) => total + bundle.sizeBytes, 0);

  const tier = user?.tier ?? "free";
  const maxRepos = tier === "free" ? 5 : "unlimited";
  const maxDevices = tier === "free" ? 3 : "unlimited";
  return {
    tier,
    repos: { current: userRepos.length, max: maxRepos },
    devices: { current: userDevices.filter((device) => device.revokedAt === null).length, max: maxDevices },
    storage: {
      currentBytes: storageBytes,
      maxBytes: tier === "free" ? 500 * 1024 * 1024 : 50 * 1024 * 1024 * 1024
    },
    bundleSize: {
      maxBytes: tier === "free" ? 50 * 1024 * 1024 : 500 * 1024 * 1024
    },
    historyDays: tier === "free" ? 30 : 365
  };
}
