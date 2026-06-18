import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  SyncedCommit,
} from "@gitfuse/types/relay";
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
  getRelaySql,
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
  deviceId: string | null;
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

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
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

async function userStorageBytes(userId: string) {
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<{ total: number | string | null }[]>`
      select coalesce(sum(bundles.size_bytes), 0)::bigint as total
      from bundles
      join repositories on repositories.id = bundles.repository_id
      where repositories.user_id = ${userId}
        and bundles.status = 'active'
    `;
    return Number(row?.total ?? 0);
  }

  const repositoryIds = userRepositoryIds(userId);
  return [...bundles.values()]
    .filter((bundle) => repositoryIds.has(bundle.repositoryId) && bundle.status === "active")
    .reduce((total, bundle) => total + bundle.sizeBytes, 0);
}

function mapRepository(row: {
  id: string;
  user_id: string;
  root_sha: string;
  display_name: string;
  remote_url: string | null;
  relay_entry_id: string;
  created_at: Date | string;
  last_synced_at: Date | string | null;
}): Repository {
  return {
    id: row.id,
    userId: row.user_id,
    rootSha: row.root_sha,
    displayName: row.display_name,
    remoteUrl: row.remote_url,
    relayEntryId: row.relay_entry_id,
    createdAt: toIso(row.created_at) ?? "",
    lastSyncedAt: toIso(row.last_synced_at)
  };
}

function mapBundle(row: {
  id: string;
  repository_id: string;
  device_id: string;
  bundle_hash: string;
  commit_count: number;
  size_bytes: number | string;
  r2_key: string;
  status: BundleStatus;
  parent_bundle_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
}): Bundle {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    deviceId: row.device_id,
    bundleHash: row.bundle_hash,
    commitCount: Number(row.commit_count),
    sizeBytes: Number(row.size_bytes),
    r2Key: row.r2_key,
    status: row.status,
    parentBundleId: row.parent_bundle_id,
    createdAt: toIso(row.created_at) ?? "",
    expiresAt: toIso(row.expires_at) ?? ""
  };
}

function mapDevice(row: {
  id: string;
  user_id: string;
  name: string;
  last_active_at: Date | string | null;
  created_at: Date | string;
  revoked_at: Date | string | null;
}): Device {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    lastActiveAt: toIso(row.last_active_at),
    createdAt: toIso(row.created_at) ?? "",
    revokedAt: toIso(row.revoked_at)
  };
}

function nullableTimestamp(value: string | null | undefined) {
  return value && value.trim() ? value : null;
}

export type LimitCheck = { ok: true } | { ok: false; limit: LimitName; current: number; max: number };

export async function checkRepoLimit(userId: string): Promise<LimitCheck> {
  const max = numericLimit(PLAN_LIMITS[await tierForUser(userId)].repos);
  const sql = getRelaySql();
  const current = sql
    ? Number(
        (
          await sql<{ count: number | string }[]>`
            select count(*)::int as count
            from repositories
            where user_id = ${userId}
          `
        )[0]?.count ?? 0
      )
    : [...repositories.values()].filter((repo) => repo.userId === userId).length;
  if (max !== null && current >= max) return { ok: false, limit: "repos", current: current + 1, max };
  return { ok: true };
}

export async function checkDeviceLimitForApproval(
  githubUsername: string,
  email?: string | null,
  deviceId?: string | null
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
  const sql = getRelaySql();
  if (deviceId) {
    if (sql) {
      const [existing] = await sql<{ id: string }[]>`
        select id
        from devices
        where id = ${deviceId}
          and user_id = ${user.id}
          and revoked_at is null
        limit 1
      `;
      if (existing) return { ok: true };
    } else if (
      [...devices.values()].some(
        (device) =>
          device.id === deviceId &&
          device.userId === user.id &&
          device.revokedAt === null
      )
    ) {
      return { ok: true };
    }
  }
  const current = sql
    ? Number(
        (
          await sql<{ count: number | string }[]>`
            select count(*)::int as count
            from devices
            where user_id = ${user.id}
              and revoked_at is null
          `
        )[0]?.count ?? 0
      )
    : [...devices.values()].filter((device) => device.userId === user.id && device.revokedAt === null).length;
  if (max !== null && current >= max) return { ok: false, limit: "devices", current: current + 1, max };
  return { ok: true };
}

export async function checkBundleUploadLimits(userId: string, sizeBytes: number): Promise<LimitCheck> {
  const limits = PLAN_LIMITS[await tierForUser(userId)];
  if (sizeBytes > limits.bundleSizeBytes) {
    return { ok: false, limit: "bundle_size", current: sizeBytes, max: limits.bundleSizeBytes };
  }

  const currentStorage = await userStorageBytes(userId);
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
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<{
      device_id: string;
      user_id: string;
      github_username: string;
    }[]>`
      update devices
      set last_active_at = now()
      from users
      where devices.user_id = users.id
        and devices.token_hash = ${tokenHash}
        and devices.revoked_at is null
      returning devices.id as device_id,
                devices.user_id,
                users.github_username
    `;
    if (!row) return null;
    return {
      tokenHash,
      userId: row.user_id,
      deviceId: row.device_id,
      username: row.github_username
    };
  }

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

export async function createAuthSession(code: string, deviceName: string, deviceId?: string | null) {
  const session: AuthSession = {
    id: randomUUID(),
    code,
    userId: null,
    deviceId: deviceId ?? null,
    deviceName,
    approvedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
    token: null
  };
  authSessions.set(code, session);
  const sql = getRelaySql();
  if (sql) {
    await sql`
      insert into cli_auth_sessions (code, device_name, expires_at)
      values (${code}, ${deviceName}, ${session.expiresAt})
      on conflict (code)
      do update set
        device_name = excluded.device_name,
        user_id = null,
        approved_at = null,
        expires_at = excluded.expires_at,
        created_at = now()
    `;
  }
  return session;
}

export async function approveAuthSession(code: string, githubUsername: string, email = `${githubUsername}@users.noreply.github.com`) {
  let session = authSessions.get(code);
  const sql = getRelaySql();
  if (!session && sql) {
    const [row] = await sql<{
      id: string;
      code: string;
      user_id: string | null;
      device_id?: string | null;
      device_name: string;
      approved_at: Date | string | null;
      expires_at: Date | string;
      created_at: Date | string;
    }[]>`
      select id, code, user_id, device_name, approved_at, expires_at, created_at
      from cli_auth_sessions
      where code = ${code}
      limit 1
    `;
    if (row) {
      session = {
        id: row.id,
        code: row.code,
        userId: row.user_id,
        deviceId: row.device_id ?? null,
        deviceName: row.device_name,
        approvedAt: toIso(row.approved_at),
        expiresAt: toIso(row.expires_at) ?? "",
        createdAt: toIso(row.created_at) ?? "",
        token: null
      };
      authSessions.set(code, session);
    }
  }
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
    id: session.deviceId ?? randomUUID(),
    userId: user.id,
    name: session.deviceName,
    tokenHash: hashToken(token),
    token,
    lastActiveAt: nowIso(),
    createdAt: nowIso(),
    revokedAt: null
  };
  devices.set(device.id, device);

  if (sql) {
    await sql`
      insert into devices (id, user_id, name, token_hash, last_active_at, created_at, revoked_at)
      values (${device.id}, ${user.id}, ${device.name}, ${device.tokenHash}, now(), now(), null)
      on conflict (id)
      do update set
        name = excluded.name,
        token_hash = excluded.token_hash,
        last_active_at = now(),
        revoked_at = null
    `;
    await sql`
      update cli_auth_sessions
      set user_id = ${user.id},
          approved_at = now()
      where code = ${code}
    `;
  }

  session.userId = user.id;
  session.deviceId = device.id;
  session.approvedAt = nowIso();
  session.token = token;
  return { session, user, token };
}

export function authSessionDeviceId(code: string) {
  return authSessions.get(code)?.deviceId ?? null;
}

export async function pollAuthSession(code: string) {
  const session = authSessions.get(code);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  if (!session.approvedAt || !session.userId || !session.token) return { approved: false as const };
  const user = users.get(session.userId);
  return {
    approved: true as const,
    token: session.token,
    username: user?.githubUsername ?? "",
    deviceId: [...devices.values()].find((device) => device.token === session.token)?.id
  };
}

export async function listRepos(userId: string) {
  const sql = getRelaySql();
  if (sql) {
    const rows = await sql<Parameters<typeof mapRepository>[0][]>`
      select id, user_id, root_sha, display_name, remote_url, relay_entry_id, created_at, last_synced_at
      from repositories
      where user_id = ${userId}
      order by last_synced_at desc nulls last, created_at desc
    `;
    return rows.map(mapRepository);
  }
  return [...repositories.values()].filter((repo) => repo.userId === userId);
}

export async function createRepo(userId: string, input: { rootSha: string; displayName: string; remoteUrl?: string | null }) {
  const sql = getRelaySql();
  if (sql) {
    const relayId = relayEntryId(input.displayName);
    const [row] = await sql<Parameters<typeof mapRepository>[0][]>`
      insert into repositories (user_id, root_sha, display_name, remote_url, relay_entry_id)
      values (${userId}, ${input.rootSha}, ${input.displayName}, ${input.remoteUrl ?? null}, ${relayId})
      on conflict (user_id, root_sha)
      do update set
        display_name = excluded.display_name,
        remote_url = coalesce(excluded.remote_url, repositories.remote_url)
      returning id, user_id, root_sha, display_name, remote_url, relay_entry_id, created_at, last_synced_at
    `;
    return mapRepository(row);
  }

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
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<{ id: string }[]>`
      delete from repositories
      where user_id = ${userId}
        and relay_entry_id = ${relayEntryIdValue}
      returning id
    `;
    return Boolean(row);
  }

  const repo = [...repositories.values()].find((item) => item.userId === userId && item.relayEntryId === relayEntryIdValue);
  if (!repo) return false;
  repositories.delete(repo.id);
  return true;
}

export async function findRepoByRelayEntry(userId: string, relayEntryIdValue: string) {
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<Parameters<typeof mapRepository>[0][]>`
      select id, user_id, root_sha, display_name, remote_url, relay_entry_id, created_at, last_synced_at
      from repositories
      where user_id = ${userId}
        and relay_entry_id = ${relayEntryIdValue}
      limit 1
    `;
    return row ? mapRepository(row) : null;
  }

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
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<Parameters<typeof mapBundle>[0][]>`
      insert into bundles (
        repository_id,
        device_id,
        bundle_hash,
        commit_count,
        size_bytes,
        r2_key,
        status,
        parent_bundle_id,
        expires_at
      )
      values (
        ${input.repositoryId},
        ${input.deviceId},
        ${input.bundleHash},
        ${input.commitCount},
        ${input.sizeBytes},
        ${input.r2Key},
        'active',
        ${input.parentBundleId ?? null},
        ${input.expiresAt}
      )
      returning id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
    `;
    return mapBundle(row);
  }

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
  const sql = getRelaySql();
  if (sql) {
    const rows = await sql<Parameters<typeof mapBundle>[0][]>`
      select id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
      from bundles
      where repository_id = ${repositoryId}
        and status = 'active'
      order by created_at asc
    `;
    return rows.map(mapBundle);
  }

  return [...bundles.values()].filter((bundle) => bundle.repositoryId === repositoryId && bundle.status === "active");
}

export async function findBundle(bundleId: string) {
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<Parameters<typeof mapBundle>[0][]>`
      select id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
      from bundles
      where id = ${bundleId}
      limit 1
    `;
    return row ? mapBundle(row) : null;
  }

  return bundles.get(bundleId) ?? null;
}

export async function updateBundleStatus(bundleId: string, status: BundleStatus) {
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<Parameters<typeof mapBundle>[0][]>`
      update bundles
      set status = ${status}
      where id = ${bundleId}
      returning id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
    `;
    return row ? mapBundle(row) : null;
  }

  const bundle = bundles.get(bundleId);
  if (!bundle) return null;
  const updated = { ...bundle, status };
  bundles.set(bundleId, updated);
  return updated;
}

export async function findExpiredActiveBundles(now = new Date()) {
  const sql = getRelaySql();
  if (sql) {
    const rows = await sql<Parameters<typeof mapBundle>[0][]>`
      select id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
      from bundles
      where status = 'active'
        and expires_at <= ${now.toISOString()}
    `;
    return rows.map(mapBundle);
  }

  const threshold = now.getTime();
  return [...bundles.values()].filter(
    (bundle) => bundle.status === "active" && new Date(bundle.expiresAt).getTime() <= threshold
  );
}

export async function expireBundle(bundleId: string) {
  return updateBundleStatus(bundleId, "expired");
}

export async function listBundleStatusSummary() {
  const sql = getRelaySql();
  if (sql) {
    const rows = await sql<{
      id: string;
      r2_key: string;
      status: BundleStatus;
      expires_at: Date | string;
    }[]>`
      select id, r2_key, status, expires_at
      from bundles
      order by r2_key asc
    `;
    return rows.map((bundle) => ({
      id: bundle.id,
      r2Key: bundle.r2_key,
      status: bundle.status,
      expiresAt: toIso(bundle.expires_at) ?? ""
    }));
  }

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
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<{
      id: string;
      repository_id: string;
      device_id: string;
      event_type: SyncEventType;
      commit_count: number;
      bundle_size_bytes: number | string;
      created_at: Date | string;
    }[]>`
      insert into sync_events (
        repository_id,
        device_id,
        event_type,
        commit_count,
        bundle_size_bytes
      )
      values (
        ${input.repositoryId},
        ${input.deviceId},
        ${input.eventType},
        ${input.commitCount},
        ${input.bundleSizeBytes}
      )
      returning id, repository_id, device_id, event_type, commit_count, bundle_size_bytes, created_at
    `;
    await sql`
      update repositories
      set last_synced_at = ${toIso(row.created_at)}
      where id = ${input.repositoryId}
    `;
    return {
      id: row.id,
      repositoryId: row.repository_id,
      deviceId: row.device_id,
      eventType: row.event_type,
      commitCount: Number(row.commit_count),
      bundleSizeBytes: Number(row.bundle_size_bytes),
      createdAt: toIso(row.created_at) ?? ""
    };
  }

  const event: SyncEvent = { id: randomUUID(), createdAt: nowIso(), ...input };
  syncEvents.push(event);
  const repo = repositories.get(input.repositoryId);
  if (repo) repo.lastSyncedAt = event.createdAt;
  return event;
}

export async function createBundleAndSyncEvent(input: {
  repositoryId: string;
  deviceId: string;
  bundleHash: string;
  commitCount: number;
  sizeBytes: number;
  r2Key: string;
  parentBundleId?: string | null;
  expiresAt: string;
  commits: SyncedCommit[];
}) {
  const sql = getRelaySql();
  if (!sql) {
    const bundle = await createBundle(input);
    const event = await recordSyncEvent({
      repositoryId: input.repositoryId,
      deviceId: input.deviceId,
      eventType: "sync",
      commitCount: input.commitCount,
      bundleSizeBytes: input.sizeBytes
    });
    return { bundle, event };
  }

  return sql.begin(async (tx) => {
    const [bundleRow] = await tx<Parameters<typeof mapBundle>[0][]>`
      insert into bundles (
        repository_id,
        device_id,
        bundle_hash,
        commit_count,
        size_bytes,
        r2_key,
        status,
        parent_bundle_id,
        expires_at
      )
      values (
        ${input.repositoryId},
        ${input.deviceId},
        ${input.bundleHash},
        ${input.commitCount},
        ${input.sizeBytes},
        ${input.r2Key},
        'active',
        ${input.parentBundleId ?? null},
        ${input.expiresAt}
      )
      returning id, repository_id, device_id, bundle_hash, commit_count, size_bytes, r2_key, status, parent_bundle_id, created_at, expires_at
    `;

    const [eventRow] = await tx<{
      id: string;
      repository_id: string;
      device_id: string;
      event_type: SyncEventType;
      commit_count: number;
      bundle_size_bytes: number | string;
      created_at: Date | string;
    }[]>`
      insert into sync_events (
        repository_id,
        device_id,
        event_type,
        commit_count,
        bundle_size_bytes
      )
      values (
        ${input.repositoryId},
        ${input.deviceId},
        'sync',
        ${input.commitCount},
        ${input.sizeBytes}
      )
      returning id, repository_id, device_id, event_type, commit_count, bundle_size_bytes, created_at
    `;

    if (input.commits.length > 0) {
      for (const commit of input.commits) {
        await tx`
          insert into sync_event_commits (
            sync_event_id,
            repository_id,
            sha,
            message,
            author_name,
            author_email,
            authored_at,
            committed_at
          )
          values (
            ${eventRow.id},
            ${input.repositoryId},
            ${commit.sha},
            ${commit.message},
            ${commit.authorName},
            ${commit.authorEmail},
            ${nullableTimestamp(commit.authoredAt)},
            ${nullableTimestamp(commit.committedAt)}
          )
          on conflict (sync_event_id, sha) do nothing
        `;
      }
    }

    await tx`
      update repositories
      set last_synced_at = ${toIso(eventRow.created_at)}
      where id = ${input.repositoryId}
    `;

    return {
      bundle: mapBundle(bundleRow),
      event: {
        id: eventRow.id,
        repositoryId: eventRow.repository_id,
        deviceId: eventRow.device_id,
        eventType: eventRow.event_type,
        commitCount: Number(eventRow.commit_count),
        bundleSizeBytes: Number(eventRow.bundle_size_bytes),
        createdAt: toIso(eventRow.created_at) ?? ""
      }
    };
  });
}

export async function listDevices(userId: string) {
  const sql = getRelaySql();
  if (sql) {
    const rows = await sql<Parameters<typeof mapDevice>[0][]>`
      select id, user_id, name, last_active_at, created_at, revoked_at
      from devices
      where user_id = ${userId}
      order by revoked_at nulls first, last_active_at desc nulls last, created_at desc
    `;
    return rows.map(mapDevice);
  }

  return [...devices.values()]
    .filter((device) => device.userId === userId)
    .map(({ tokenHash: _tokenHash, token: _token, ...device }) => device);
}

export async function revokeDevice(userId: string, deviceId: string) {
  const sql = getRelaySql();
  if (sql) {
    const [row] = await sql<{ id: string }[]>`
      update devices
      set revoked_at = coalesce(revoked_at, now())
      where id = ${deviceId}
        and user_id = ${userId}
      returning id
    `;
    return Boolean(row);
  }

  const device = devices.get(deviceId);
  if (!device || device.userId !== userId) return false;
  device.revokedAt = nowIso();
  return true;
}

export async function getUsage(userId: string): Promise<UsageSummary> {
  const userRepos = await listRepos(userId);
  const userDevices = await listDevices(userId);
  const storageBytes = await userStorageBytes(userId);
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
