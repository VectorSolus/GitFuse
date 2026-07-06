import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { SyncedCommit } from "@gitfuse/types/relay";
import type { AuthenticatedDevice } from "../db/queries";
import {
  bundleAccountId,
  checkBundleUploadLimits,
  createBundleAndSyncEvent,
  findBundle,
  findRepoByRelayEntry,
  getUsage,
  listBundles,
  updateBundleStatus
} from "../db/queries";
import { deleteBundleObject, getBundleObject, putBundleObject } from "../storage/r2";
import { badRequest, conflict, notFound, overLimit } from "../errors/responses";

type Variables = {
  auth: AuthenticatedDevice;
};

const uploadLocks = new Set<string>();

async function withUploadLock<T>(relayEntryId: string, action: () => Promise<T>) {
  if (uploadLocks.has(relayEntryId)) return { locked: false as const };
  uploadLocks.add(relayEntryId);
  try {
    return { locked: true as const, value: await action() };
  } finally {
    uploadLocks.delete(relayEntryId);
  }
}

export const bundleRoutes = new Hono<{ Variables: Variables }>();

bundleRoutes.post("/upload", async (c) => {
  const auth = c.get("auth");
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return badRequest(c, "multipart/form-data upload is required.");

  const form = await c.req.formData();
  const relayEntryId = String(form.get("relayEntryId") ?? "");
  const bundleHash = String(form.get("bundleHash") ?? "");
  const commitCount = Number(form.get("commitCount") ?? 0);
  const sizeBytes = Number(form.get("sizeBytes") ?? 0);
  const parentBundleId = form.get("parentBundleId") ? String(form.get("parentBundleId")) : null;
  const commits = parseSyncedCommits(String(form.get("commits") ?? "[]"));
  const file = form.get("bundle");

  if (!relayEntryId || !bundleHash || !commitCount || !sizeBytes || !(file instanceof File)) {
    return badRequest(c, "relayEntryId, bundleHash, commitCount, sizeBytes, and bundle file are required.");
  }

  const limit = await checkBundleUploadLimits(auth.userId, sizeBytes);
  if (!limit.ok) return overLimit(c, limit.limit, limit.current, limit.max);

  const locked = await withUploadLock(relayEntryId, async () => {
    const repository = await findRepoByRelayEntry(auth.userId, relayEntryId);
    if (!repository) return { missing: true as const };

    const r2Key = `${auth.userId}/${relayEntryId}/${randomUUID()}.bundle.enc`;
    await putBundleObject(r2Key, await file.arrayBuffer());

    const usage = await getUsage(auth.userId);
    const expiresAt = new Date(
      Date.now() + usage.historyDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const { bundle } = await createBundleAndSyncEvent({
      repositoryId: repository.id,
      deviceId: auth.deviceId,
      bundleHash,
      commitCount,
      sizeBytes,
      r2Key,
      parentBundleId,
      expiresAt,
      commits
    });

    return { missing: false as const, bundle };
  });

  if (!locked.locked) return conflict(c, "A bundle upload for this repository is already in progress.");
  if (locked.value.missing) return notFound(c, "Repository relay entry not found.");
  return c.json({ bundle: locked.value.bundle }, 201);
});

bundleRoutes.get("/:relayEntryId", async (c) => {
  const auth = c.get("auth");
  const repository = await findRepoByRelayEntry(auth.userId, c.req.param("relayEntryId"));
  if (!repository) return notFound(c, "Repository relay entry not found.");

  return c.json({ bundles: await listBundles(repository.id) });
});

bundleRoutes.get("/:bundleId/download", async (c) => {
  const auth = c.get("auth");
  const bundle = await findBundle(c.req.param("bundleId"));
  if (!bundle || bundle.status !== "active") return notFound(c, "Bundle not found.");
  if (await bundleAccountId(bundle.repositoryId) !== auth.userId) return notFound(c, "Bundle not found.");

  const object = await getBundleObject(bundle.r2Key);
  if (!object) return notFound(c, "Bundle object not found.");

  const body = new ArrayBuffer(object.byteLength);
  new Uint8Array(body).set(object);

  return new Response(body, {
    headers: {
      "content-type": "application/octet-stream",
      "x-gitfuse-bundle-hash": bundle.bundleHash
    }
  });
});

bundleRoutes.delete("/:bundleId", async (c) => {
  const bundle = await updateBundleStatus(c.req.param("bundleId"), "dropped");
  if (!bundle) return notFound(c, "Bundle not found.");
  await deleteBundleObject(bundle.r2Key);
  return c.json({ deleted: true });
});

function parseSyncedCommits(raw: string): SyncedCommit[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const commit = item as Partial<SyncedCommit>;
        if (typeof commit.sha !== "string" || typeof commit.message !== "string") {
          return null;
        }
        return {
          sha: commit.sha,
          message: commit.message,
          authorName: commit.authorName ?? null,
          authorEmail: commit.authorEmail ?? null,
          authoredAt: commit.authoredAt ?? null,
          committedAt: commit.committedAt ?? null
        } satisfies SyncedCommit;
      })
      .filter((commit): commit is SyncedCommit => Boolean(commit));
  } catch {
    return [];
  }
}
