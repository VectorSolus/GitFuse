import { assertRelayDatabaseConfiguration } from "./env";
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
import { checkRelayDatabaseReady } from "./db/postgres";
import { sessionExpired } from "./errors/responses";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { bundleRoutes } from "./routes/bundles";
import { deviceRoutes } from "./routes/devices";
import { repoRoutes } from "./routes/repos";
import { listBundleObjectKeys, putBundleObject } from "./storage/r2";

type Variables = {
  auth: AuthenticatedDevice;
};

type RelayReadinessCheck = () => Promise<
  | { ok: true }
  | { ok: false; reason: "database_not_configured" | "database_unreachable" | "database_timeout" }
>;

type RelayAppOptions = {
  readinessCheck?: RelayReadinessCheck;
};

export function createRelayApp(options: RelayAppOptions = {}) {
  const app = new Hono<{ Variables: Variables }>();
  const readinessCheck = options.readinessCheck ?? checkRelayDatabaseReady;

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      version: process.env.GITFUSE_RELAY_VERSION ?? "dev",
      commit: process.env.GITFUSE_RELAY_COMMIT ?? "unknown",
    })
  );

  app.get("/ready", async (c) => {
    const ready = await readinessCheck();
    if (ready.ok) return c.json({ status: "ready" });
    return c.json({ status: "not_ready", reason: ready.reason }, 503);
  });

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
    await putBundleObject(seeded.paidOldKey, new TextEncoder().encode("paid-old"));
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
    return c.json(await cleanupExpiredBundles({ dryRun: c.req.query("dryRun") === "1" }));
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
  app.route("/v1/account", accountRoutes);
  app.get("/v1/usage", async (c) => {
    const auth = c.get("auth");
    return c.json(await getUsage(auth.userId));
  });

  return app;
}

export const app = createRelayApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  assertRelayDatabaseConfiguration();
  const port = Number(process.env.PORT ?? process.env.RELAY_PORT ?? 8787);
  const hostname = process.env.RELAY_HOST ?? "0.0.0.0";
  serve({ fetch: app.fetch, port, hostname });
  console.log(`gitfuse relay listening on ${hostname}:${port}`);
}
