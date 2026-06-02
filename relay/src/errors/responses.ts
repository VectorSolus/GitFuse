import type { Context } from "hono";
import type { LimitName } from "@gitfuse/types/billing";
import type { BundleRejectedReason, RelayError, SessionExpiredError } from "@gitfuse/types/relay";

export const SESSION_EXPIRED: SessionExpiredError = {
  error: "SESSION_EXPIRED",
  message: "Session expired. Run 'gitfuse auth' to re-authenticate. Your local changes are safe — nothing was lost."
};

export function badRequest(c: Context, message: string) {
  return c.json({ error: "BAD_REQUEST", message } satisfies RelayError, 400);
}

export function notFound(c: Context, message: string) {
  return c.json({ error: "NOT_FOUND", message } satisfies RelayError, 404);
}

export function conflict(c: Context, message: string) {
  return c.json({ error: "CONFLICT", message } satisfies RelayError, 409);
}

export function sessionExpired(c: Context) {
  return c.json(SESSION_EXPIRED, 401);
}

export function overLimit(c: Context, limit: LimitName, current: number, max: number) {
  return c.json({ error: "OVER_LIMIT", limit, current, max } satisfies RelayError, 402);
}

export function bundleRejected(c: Context, reason: BundleRejectedReason, relayMinVersion: string) {
  return c.json(
    { error: "BUNDLE_REJECTED", reason, relay_min_version: relayMinVersion } satisfies RelayError,
    422
  );
}
