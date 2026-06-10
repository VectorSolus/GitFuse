import { expireBundle, findExpiredActiveBundles } from "./db/queries";
import { deleteBundleObject } from "./storage/r2";

export async function cleanupExpiredBundles(now = new Date()) {
  const expiredBundles = await findExpiredActiveBundles(now);
  let deletedObjects = 0;

  for (const bundle of expiredBundles) {
    await expireBundle(bundle.id);
    if (await deleteBundleObject(bundle.r2Key)) {
      deletedObjects += 1;
    }
  }

  return {
    expiredBundles: expiredBundles.length,
    deletedObjects
  };
}
