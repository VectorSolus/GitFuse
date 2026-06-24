import { bundleAccountId, expireBundle, findExpiredFreeBundles } from "./db/queries";
import { deleteBundleObject } from "./storage/r2";

export async function cleanupExpiredBundles(options: { now?: Date; dryRun?: boolean } = {}) {
  const now = options.now ?? new Date();
  const expiredBundles = await findExpiredFreeBundles(now, 7);
  let deletedObjects = 0;
  const logs = new Map<string, { account_id: string; count: number; from: string; to: string }>();

  for (const bundle of expiredBundles) {
    const accountId = (await bundleAccountId(bundle.repositoryId)) ?? "unknown";
    const existing = logs.get(accountId);
    const createdAt = bundle.createdAt;
    logs.set(accountId, {
      account_id: accountId,
      count: (existing?.count ?? 0) + 1,
      from: existing && existing.from < createdAt ? existing.from : createdAt,
      to: existing && existing.to > createdAt ? existing.to : createdAt
    });

    if (options.dryRun) continue;

    await expireBundle(bundle.id);
    if (await deleteBundleObject(bundle.r2Key)) {
      deletedObjects += 1;
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    expiredBundles: expiredBundles.length,
    deletedObjects,
    retentionDays: 7,
    logs: [...logs.values()]
  };
}
