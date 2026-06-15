import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Bundle,
  BundleStatus,
  Device,
  Repository,
  SyncEvent,
  SyncEventType
} from "@gitfuse/types/workspace";
import { PLAN_LIMITS, type LimitName, type PlanTier, type UsageSummary } from "@gitfuse/types/billing";
import {
  ensureRelayDatabaseUser,
  findRelayDatabaseUserById,
  findRelayDatabaseUserByIdentity,
  relayDatabaseConfigured
} from "./postgres";

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

async function tierForUser(userId: string) {
  const databaseUser = await findRelayDatabaseUserById(userId);
  return databaseUser?.tier ?? users.get(userId)?.tier ?? "free";
}

function numericLimit(value: number | "unlimited") {
  return value === "unlimited" ? null : value;
}

function userRepositoryIds(userId: string) {
  return new Set([...repositories.values()].filter((repo) => repo.userId === userId).map((repo) => repo.id));
}

function userStorageBytes(userId: string) {
  const repositoryIds = userRepositoryIds(userId);
  return [...bundles.values()]
    .filter((bundle) => repositoryIds.has(bundle.repositoryId) && bundle.status === "active")
    .reduce((total, bundle) => total + bundle.sizeBytes, 0);
}

export type LimitCheck = { ok: true } | { ok: false; limit: LimitName; current: number; max: number };

export async function checkRepoLimit(userId: string): Promise<LimitCheck> {
  const max = numericLimit(PLAN_LIMITS[await tierForUser(userId)].repos);
  const current = [...repositories.values()].filter((repo) => repo.userId === userId).length;
  if (max !== null && current >= max) return { ok: false, limit: "repos", current: current + 1, max };
  return { ok: true };
}

export async function checkDeviceLimitForApproval(
  githubUsername: string,
  email?: string | null
): Promise<LimitCheck> {
  const databaseUser = await findRelayDatabaseUserByIdentity(
    githubUsername,
    email
  );
  const user =
    databaseUser ??
    [...users.values()].find(
      (record) => record.githubUsername === githubUsername
    );
  if (!user) return { ok: true };
  const max = numericLimit(PLAN_LIMITS[user.tier].devices);
  const current = [...devices.values()].filter((device) => device.userId === user.id && device.revokedAt === null).length;
  if (max !== null && current >= max) return { ok: false, limit: "devices", current: current + 1, max };
  return { ok: true };
}

export async function checkBundleUploadLimits(userId: string, sizeBytes: number): Promise<LimitCheck> {
  const limits = PLAN_LIMITS[await tierForUser(userId)];
  if (sizeBytes > limits.bundleSizeBytes) {
    return { ok: false, limit: "bundle_size", current: sizeBytes, max: limits.bundleSizeBytes };
  }

  const currentStorage = userStorageBytes(userId);
  if (currentStorage + sizeBytes > limits.storageTotalBytes) {
    return { ok: false, limit: "storage", current: currentStorage + sizeBytes, max: limits.storageTotalBytes };
  }

  return { ok: true };
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
      if (
        relayDatabaseConfigured() &&
        !(await findRelayDatabaseUserById(device.userId))
      ) {
        return null;
      }
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

  const databaseUser = await ensureRelayDatabaseUser(
    githubUsername,
    email
  );
  let user = databaseUser
    ? {
        id: databaseUser.id,
        githubUsername: databaseUser.githubUsername,
        email: databaseUser.email,
        tier: databaseUser.tier
      }
    : [...users.values()].find(
        (record) => record.githubUsername === githubUsername
      );
  if (!user) {
    user = { id: randomUUID(), githubUsername, email, tier: "free" };
  }
  users.set(user.id, user);

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

export async function findExpiredActiveBundles(now = new Date()) {
  const threshold = now.getTime();
  return [...bundles.values()].filter(
    (bundle) => bundle.status === "active" && new Date(bundle.expiresAt).getTime() <= threshold
  );
}

export async function expireBundle(bundleId: string) {
  return updateBundleStatus(bundleId, "expired");
}

export async function listBundleStatusSummary() {
  return [...bundles.values()]
    .map((bundle) => ({
      id: bundle.id,
      r2Key: bundle.r2Key,
      status: bundle.status,
      expiresAt: bundle.expiresAt
    }))
    .sort((a, b) => a.r2Key.localeCompare(b.r2Key));
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
  const userRepos = await listRepos(userId);
  const userDevices = await listDevices(userId);
  const storageBytes = userStorageBytes(userId);
  const tier = await tierForUser(userId);
  const limits = PLAN_LIMITS[tier];
  return {
    tier,
    repos: { current: userRepos.length, max: limits.repos },
    devices: { current: userDevices.filter((device) => device.revokedAt === null).length, max: limits.devices },
    storage: {
      currentBytes: storageBytes,
      maxBytes: limits.storageTotalBytes
    },
    bundleSize: {
      maxBytes: limits.bundleSizeBytes
    },
    historyDays: limits.historyDays
  };
}

export async function seedLimitScenario(input: {
  username: string;
  tier?: PlanTier;
  repoCount?: number;
  deviceCount?: number;
  storageBytes?: number;
}) {
  const user: UserRecord = {
    id: randomUUID(),
    githubUsername: input.username,
    email: `${input.username}@example.com`,
    tier: input.tier ?? "free"
  };
  users.set(user.id, user);

  const token = `gf_${randomBytes(32).toString("base64url")}`;
  const primaryDevice: Device & { tokenHash: string; token: string } = {
    id: randomUUID(),
    userId: user.id,
    name: `${input.username}-primary`,
    tokenHash: hashToken(token),
    token,
    lastActiveAt: nowIso(),
    createdAt: nowIso(),
    revokedAt: null
  };
  devices.set(primaryDevice.id, primaryDevice);

  for (let i = 1; i < (input.deviceCount ?? 1); i += 1) {
    const deviceToken = `gf_${randomBytes(32).toString("base64url")}`;
    const deviceId = randomUUID();
    devices.set(deviceId, {
      id: deviceId,
      userId: user.id,
      name: `${input.username}-device-${i + 1}`,
      tokenHash: hashToken(deviceToken),
      token: deviceToken,
      lastActiveAt: nowIso(),
      createdAt: nowIso(),
      revokedAt: null
    });
  }

  const createdRepos: Repository[] = [];
  for (let i = 0; i < (input.repoCount ?? 0); i += 1) {
    const repo: Repository = {
      id: randomUUID(),
      userId: user.id,
      rootSha: `${input.username}-root-${i}`,
      displayName: `${input.username}-repo-${i}`,
      remoteUrl: null,
      relayEntryId: `${input.username}-entry-${i}`,
      createdAt: nowIso(),
      lastSyncedAt: null
    };
    repositories.set(repo.id, repo);
    createdRepos.push(repo);
  }

  if (input.storageBytes && createdRepos[0]) {
    const bundle: Bundle = {
      id: randomUUID(),
      repositoryId: createdRepos[0].id,
      deviceId: primaryDevice.id,
      bundleHash: `${input.username}-seed-bundle`,
      commitCount: 1,
      sizeBytes: input.storageBytes,
      r2Key: `${user.id}/${createdRepos[0].relayEntryId}/seed.bundle.enc`,
      status: "active",
      parentBundleId: null,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    bundles.set(bundle.id, bundle);
  }

  return { token, userId: user.id, deviceId: primaryDevice.id, relayEntryId: createdRepos[0]?.relayEntryId ?? null };
}

export async function seedCleanupScenario(input: { username: string }) {
  const user: UserRecord = {
    id: randomUUID(),
    githubUsername: input.username,
    email: `${input.username}@example.com`,
    tier: "free"
  };
  users.set(user.id, user);

  const deviceToken = `gf_${randomBytes(32).toString("base64url")}`;
  const device: Device & { tokenHash: string; token: string } = {
    id: randomUUID(),
    userId: user.id,
    name: `${input.username}-device`,
    tokenHash: hashToken(deviceToken),
    token: deviceToken,
    lastActiveAt: nowIso(),
    createdAt: nowIso(),
    revokedAt: null
  };
  devices.set(device.id, device);

  const repo: Repository = {
    id: randomUUID(),
    userId: user.id,
    rootSha: `${input.username}-root`,
    displayName: `${input.username}-repo`,
    remoteUrl: null,
    relayEntryId: `${input.username}-entry`,
    createdAt: nowIso(),
    lastSyncedAt: null
  };
  repositories.set(repo.id, repo);

  const expiredKey = `${user.id}/${repo.relayEntryId}/expired.bundle.enc`;
  const activeKey = `${user.id}/${repo.relayEntryId}/active.bundle.enc`;
  const droppedKey = `${user.id}/${repo.relayEntryId}/dropped.bundle.enc`;
  const baseBundle = {
    repositoryId: repo.id,
    deviceId: device.id,
    commitCount: 1,
    sizeBytes: 10,
    parentBundleId: null,
    createdAt: nowIso()
  };

  const expiredBundle: Bundle = {
    id: randomUUID(),
    ...baseBundle,
    bundleHash: `${input.username}-expired`,
    r2Key: expiredKey,
    status: "active",
    expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
  };
  const activeBundle: Bundle = {
    id: randomUUID(),
    ...baseBundle,
    bundleHash: `${input.username}-active`,
    r2Key: activeKey,
    status: "active",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  const droppedBundle: Bundle = {
    id: randomUUID(),
    ...baseBundle,
    bundleHash: `${input.username}-dropped`,
    r2Key: droppedKey,
    status: "dropped",
    expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
  };

  bundles.set(expiredBundle.id, expiredBundle);
  bundles.set(activeBundle.id, activeBundle);
  bundles.set(droppedBundle.id, droppedBundle);

  return {
    expiredKey,
    activeKey,
    droppedKey,
    bundleIds: {
      expired: expiredBundle.id,
      active: activeBundle.id,
      dropped: droppedBundle.id
    }
  };
}
