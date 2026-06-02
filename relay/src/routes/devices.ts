import { Hono } from "hono";
import type { AuthenticatedDevice } from "../db/queries";
import { listDevices, revokeDevice } from "../db/queries";
import { notFound } from "../errors/responses";

type Variables = {
  auth: AuthenticatedDevice;
};

export const deviceRoutes = new Hono<{ Variables: Variables }>();

deviceRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  return c.json({ devices: await listDevices(auth.userId) });
});

deviceRoutes.delete("/:deviceId", async (c) => {
  const auth = c.get("auth");
  const revoked = await revokeDevice(auth.userId, c.req.param("deviceId"));
  if (!revoked) return notFound(c, "Device not found.");
  return c.json({ revoked: true });
});
