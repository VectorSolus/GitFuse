# Relay Production Environment

This manifest lists variables consumed by `relay/src`.

## Required

- `DATABASE_URL` secret, production-only: Postgres connection string. Required in production; startup fails without it.

## Optional

- `PORT` non-secret, production: Railway-provided port. Preferred over `RELAY_PORT`.
- `RELAY_PORT` non-secret, local-development: local fallback port when `PORT` is absent. Defaults to `8787`.
- `RELAY_HOST` non-secret, production/local-development: bind host. Defaults to `0.0.0.0`.
- `DATABASE_POOL_MAX` non-secret: Postgres pool max. Defaults to `4`.
- `DATABASE_IDLE_TIMEOUT` non-secret: Postgres idle timeout seconds. Defaults to `20`.
- `DATABASE_CONNECT_TIMEOUT` non-secret: Postgres connect timeout seconds. Defaults to `10`.
- `DATABASE_MAX_LIFETIME` non-secret: Postgres max lifetime seconds. Defaults to `1800`.
- `CLEANUP_JOB_SECRET` secret: bearer token for `/v1/admin/cleanup/expired-bundles`.
- `GITFUSE_RELAY_VERSION` non-secret: health endpoint version metadata. Defaults to `dev`.
- `GITFUSE_RELAY_COMMIT` non-secret: health endpoint commit metadata. Defaults to `unknown`.

## Local Development Only

- `GITFUSE_ALLOW_IN_MEMORY_RELAY` non-secret: set to `1` only for isolated tests without Postgres. Ignored in production; production still requires `DATABASE_URL`.

## Example-Only Or Future Storage Variables

`relay/.env.example` currently lists `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. The current relay storage module does not consume these variables yet; production bundle persistence must be independently verified before declaring the relay production-ready.

## Dashboard-Only Variables Not Included

OAuth credentials, billing keys, email provider keys, and NextAuth settings are dashboard variables unless relay code starts consuming them directly.

## Readiness Checklist Before Release Default

1. Railway deployment exists.
2. TLS works for `https://relay.gitfuse.dev`.
3. `/health` returns HTTP 200.
4. `/ready` returns HTTP 200.
5. CLI authentication works against production.
6. Device listing works against production.
7. Bundle upload and download persist across process restarts.
8. No localhost dependency remains.
9. Database pool settings remain bounded.
10. Object storage persists payloads.
