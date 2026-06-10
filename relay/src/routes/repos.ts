import { Hono } from "hono";
import type { CreateRepoRequest } from "@gitfuse/types/relay";
import type { AuthenticatedDevice } from "../db/queries";
import { checkRepoLimit, createRepo, deleteRepo, listRepos } from "../db/queries";
import { badRequest, notFound, overLimit } from "../errors/responses";

type Variables = {
  auth: AuthenticatedDevice;
};

export const repoRoutes = new Hono<{ Variables: Variables }>();

repoRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const repositories = await listRepos(auth.userId);
  return c.json({ repositories });
});

repoRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<Partial<CreateRepoRequest>>().catch(() => null);
  if (!body?.rootSha || !body.displayName) return badRequest(c, "rootSha and displayName are required.");

  const limit = await checkRepoLimit(auth.userId);
  if (!limit.ok) return overLimit(c, limit.limit, limit.current, limit.max);

  const repository = await createRepo(auth.userId, {
    rootSha: body.rootSha,
    displayName: body.displayName,
    remoteUrl: body.remoteUrl
  });
  return c.json({ repository }, 201);
});

repoRoutes.delete("/:relayEntryId", async (c) => {
  const auth = c.get("auth");
  const removed = await deleteRepo(auth.userId, c.req.param("relayEntryId"));
  if (!removed) return notFound(c, "Repository relay entry not found.");
  return c.json({ deleted: true });
});
