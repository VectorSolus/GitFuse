import { describe, expect, it } from "vitest";
import { cleanupExpiredBundles } from "./cleanup";
import { seedCleanupScenario } from "./db/queries";
import { listBundleObjectKeys, putBundleObject } from "./storage/r2";

describe("free retention cleanup", () => {
  it("dry-runs idempotently and only deletes free history older than 7 days", async () => {
    const seeded = await seedCleanupScenario({ username: `cleanup-${Date.now()}` });
    await putBundleObject(seeded.expiredKey, new TextEncoder().encode("expired"));
    await putBundleObject(seeded.activeKey, new TextEncoder().encode("active"));
    await putBundleObject(seeded.droppedKey, new TextEncoder().encode("dropped"));
    await putBundleObject(seeded.paidOldKey, new TextEncoder().encode("paid-old"));

    const dryRun = await cleanupExpiredBundles({ dryRun: true });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.expiredBundles).toBeGreaterThanOrEqual(1);
    expect(await listBundleObjectKeys()).toContain(seeded.expiredKey);
    expect(await listBundleObjectKeys()).toContain(seeded.paidOldKey);

    const result = await cleanupExpiredBundles();
    expect(result.dryRun).toBe(false);
    expect(result.deletedObjects).toBeGreaterThanOrEqual(1);
    expect(await listBundleObjectKeys()).not.toContain(seeded.expiredKey);
    expect(await listBundleObjectKeys()).toContain(seeded.activeKey);
    expect(await listBundleObjectKeys()).toContain(seeded.droppedKey);
    expect(await listBundleObjectKeys()).toContain(seeded.paidOldKey);

    const rerun = await cleanupExpiredBundles();
    expect(rerun.deletedObjects).toBe(0);
  });
});
