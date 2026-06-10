import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cleanupExpiredBundles } from "./cleanup";
import type { AuthenticatedDevice } from "./db/queries";
import {
  authenticateToken,
  getUsage,
  listBundleStatusSummary,
  seedCleanupScenario,
  seedLimitScenario
} from "./db/queries";
import { sessionExpired } from "./errors/responses";
import { authRoutes } from "./routes/auth";
import { bundleRoutes } from "./routes/bundles";
import { deviceRoutes } from "./routes/devices";
import { repoRoutes } from "./routes/repos";
import { listBundleObjectKeys, putBundleObject } from "./storage/r2";

type Variables = {
  auth: AuthenticatedDevice;
};

export const app = new Hono<{ Variables: Variables }>();

app.get("/health", (c) => c.json({ ok: true, service: "gitfuse-relay" }));

app.post("/__test/limits/seed", async (c) => {
  if (process.env.NODE_ENV === "production") return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  return c.json(
    await seedLimitScenario({
      username: String(body.username ?? `limit-${Date.now()}`),
      tier: body.tier,
      repoCount: Number(body.repoCount ?? 0),
      deviceCount: Number(body.deviceCount ?? 1),
      storageBytes: Number(body.storageBytes ?? 0)
    })
  );
});

app.post("/__test/cleanup/seed", async (c) => {
  if (process.env.NODE_ENV === "production") return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const seeded = await seedCleanupScenario({ username: String(body.username ?? `cleanup-${Date.now()}`) });
  await putBundleObject(seeded.expiredKey, new TextEncoder().encode("expired"));
  await putBundleObject(seeded.activeKey, new TextEncoder().encode("active"));
  await putBundleObject(seeded.droppedKey, new TextEncoder().encode("dropped"));
  return c.json(seeded);
});

app.get("/__test/cleanup/state", async (c) => {
  if (process.env.NODE_ENV === "production") return c.json({ error: "not_found" }, 404);
  return c.json({ bundles: await listBundleStatusSummary(), objects: await listBundleObjectKeys() });
});

app.post("/v1/admin/cleanup/expired-bundles", async (c) => {
  const secret = process.env.CLEANUP_JOB_SECRET;
  if (secret && c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "UNAUTHORIZED", message: "Cleanup job is not authorized." }, 401);
  }
  return c.json(await cleanupExpiredBundles());
});

app.route("/v1/auth", authRoutes);

app.use("/v1/*", async (c, next) => {
  if (c.req.path.startsWith("/v1/auth/")) return next();

  const header = c.req.header("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return sessionExpired(c);

  const auth = await authenticateToken(token);
  if (!auth) return sessionExpired(c);

  c.set("auth", auth);
  return next();
});

app.route("/v1/repos", repoRoutes);
app.route("/v1/bundles", bundleRoutes);
app.route("/v1/devices", deviceRoutes);
app.get("/v1/usage", async (c) => {
  const auth = c.get("auth");
  return c.json(await getUsage(auth.userId));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.RELAY_PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`gitfuse relay listening on :${port}`);
}
