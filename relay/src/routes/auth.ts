import { Hono } from "hono";
import type { ApproveAuthRequest, RegisterDeviceRequest } from "@gitfuse/types/relay";
import { approveAuthSession, checkDeviceLimitForApproval, createAuthSession, findAuthSessionForApproval, pollAuthSession } from "../db/queries.js";
import { badRequest, deviceLimitReached, notFound } from "../errors/responses.js";

export const authRoutes = new Hono();

authRoutes.post("/device", async (c) => {
  const body = await c.req.json<Partial<RegisterDeviceRequest>>().catch(() => null);
  if (!body?.code || !body.deviceName) return badRequest(c, "code and deviceName are required.");

  const session = await createAuthSession(body.code, body.deviceName, body.deviceId);
  return c.json({ code: session.code, expiresAt: session.expiresAt }, 201);
});

authRoutes.post("/approve", async (c) => {
  const body = await c.req.json<Partial<ApproveAuthRequest>>().catch(() => null);
  if (!body?.code || !body.githubUsername) return badRequest(c, "code and githubUsername are required.");

  const session = await findAuthSessionForApproval(body.code);
  if (!session) return notFound(c, "CLI auth session not found or expired.");

  const limit = await checkDeviceLimitForApproval(
    body.githubUsername,
    body.email,
    body.deviceId ?? session.deviceId
  );
  if (!limit.ok) return deviceLimitReached(c, limit.current, limit.max);

  const approved = await approveAuthSession(body.code, body.githubUsername, body.email);
  if (!approved) return notFound(c, "CLI auth session not found or expired.");

  return c.json({ approved: true });
});

authRoutes.get("/poll/:code", async (c) => {
  const result = await pollAuthSession(c.req.param("code"));
  if (!result) return notFound(c, "CLI auth session not found or expired.");
  return c.json(result);
});
