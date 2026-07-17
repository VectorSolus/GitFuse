import { Hono } from "hono";
import type { AuthenticatedDevice } from "../db/queries.js";
import { getAccountLimits } from "../db/queries.js";

type Variables = {
  auth: AuthenticatedDevice;
};

export const accountRoutes = new Hono<{ Variables: Variables }>();

accountRoutes.get("/limits", async (c) => {
  const auth = c.get("auth");
  return c.json(await getAccountLimits(auth.userId));
});
