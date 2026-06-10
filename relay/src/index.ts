import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AuthenticatedDevice } from "./db/queries";
import { authenticateToken, getUsage, seedLimitScenario } from "./db/queries";
import { sessionExpired } from "./errors/responses";
import { authRoutes } from "./routes/auth";
import { bundleRoutes } from "./routes/bundles";
import { deviceRoutes } from "./routes/devices";
import { repoRoutes } from "./routes/repos";

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
