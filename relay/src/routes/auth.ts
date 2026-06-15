import { Hono } from "hono";
import type { ApproveAuthRequest, RegisterDeviceRequest } from "@gitfuse/types/relay";
import { approveAuthSession, checkDeviceLimitForApproval, createAuthSession, pollAuthSession } from "../db/queries";
import { badRequest, notFound, overLimit } from "../errors/responses";

export const authRoutes = new Hono();

authRoutes.post("/device", async (c) => {
  const body = await c.req.json<Partial<RegisterDeviceRequest>>().catch(() => null);
  if (!body?.code || !body.deviceName) return badRequest(c, "code and deviceName are required.");

  const session = await createAuthSession(body.code, body.deviceName);
  return c.json({ code: session.code, expiresAt: session.expiresAt }, 201);
});

authRoutes.post("/approve", async (c) => {
  const body = await c.req.json<Partial<ApproveAuthRequest>>().catch(() => null);
  if (!body?.code || !body.githubUsername) return badRequest(c, "code and githubUsername are required.");

  const limit = await checkDeviceLimitForApproval(
    body.githubUsername,
    body.email
  );
  if (!limit.ok) return overLimit(c, limit.limit, limit.current, limit.max);

  const approved = await approveAuthSession(body.code, body.githubUsername, body.email);
  if (!approved) return notFound(c, "CLI auth session not found or expired.");

  return c.json({ approved: true });
});

authRoutes.get("/poll/:code", async (c) => {
  const result = await pollAuthSession(c.req.param("code"));
  if (!result) return notFound(c, "CLI auth session not found or expired.");
  return c.json(result);
});
