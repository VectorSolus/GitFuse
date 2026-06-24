import { Hono } from "hono";
import type { AuthenticatedDevice } from "../db/queries";
import { getAccountLimits } from "../db/queries";

type Variables = {
  auth: AuthenticatedDevice;
};

export const accountRoutes = new Hono<{ Variables: Variables }>();

accountRoutes.get("/limits", async (c) => {
  const auth = c.get("auth");
  return c.json(await getAccountLimits(auth.userId));
});
