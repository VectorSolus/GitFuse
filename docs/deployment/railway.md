# Railway Deployment

GitFuse deploys as two separate Railway services from the same monorepo:

1. `gitfuse-dashboard`
2. `gitfuse-relay`

Keep the Railway service root/build context at the repository root so `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and workspace packages are available during install and build.

## Service Configs

| Service | Railway config path | Healthcheck |
| --- | --- | --- |
| `gitfuse-dashboard` | `/apps/dashboard/railway.toml` | `/api/health` |
| `gitfuse-relay` | `/relay/railway.toml` | `/health` |

Production domains are assigned in Phase 60 after TASK-039 is committed. Set OAuth callback URLs, billing webhook URLs, and public app URLs only after the Phase 60 production dashboard and relay domains exist.

## Dashboard Environment

Set these variables on the `gitfuse-dashboard` Railway service. Use names only in git; do not commit real secret values.

```text
NODE_ENV=production
PORT
DATABASE_URL
AUTH_SECRET
NEXTAUTH_SECRET
AUTH_URL
NEXTAUTH_URL
NEXT_PUBLIC_APP_URL
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
PAIRING_PIN_ENCRYPTION_KEY
GITFUSE_RELAY_URL
NEXT_PUBLIC_GITFUSE_RELAY_URL
PAYMENT_PROVIDER
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PRO_PLAN_ID
RAZORPAY_TEAM_PLAN_ID
NEXT_PUBLIC_RAZORPAY_KEY_ID
RESEND_API_KEY
RESEND_FROM_EMAIL
EMAIL_PROVIDER
EMAIL_JOB_SECRET
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_SENDER_EMAIL
GMAIL_FROM_NAME
DATABASE_POOL_MAX
DATABASE_IDLE_TIMEOUT
DATABASE_CONNECT_TIMEOUT
DATABASE_MAX_LIFETIME
```

`PORT` is provided by Railway. `AUTH_SECRET` is preferred by the current dashboard auth code, with `NEXTAUTH_SECRET` retained for NextAuth compatibility.

## Relay Environment

Set these variables on the `gitfuse-relay` Railway service. Use names only in git; do not commit real secret values.

```text
NODE_ENV=production
PORT
DATABASE_URL
DATABASE_POOL_MAX
DATABASE_IDLE_TIMEOUT
DATABASE_CONNECT_TIMEOUT
DATABASE_MAX_LIFETIME
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
RELAY_HOST
CLEANUP_JOB_SECRET
GITFUSE_RELAY_VERSION
GITFUSE_RELAY_COMMIT
GITFUSE_RELAY_MIN_VERSION
```

`PORT` is provided by Railway. The relay defaults to `0.0.0.0` when `RELAY_HOST` is unset, which allows Railway to route traffic to the service.

## Phase 60 Follow-Up

After Railway assigns production domains:

- Set `AUTH_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL` to the dashboard production URL.
- Set `GITFUSE_RELAY_URL` and `NEXT_PUBLIC_GITFUSE_RELAY_URL` to the relay production URL.
- Configure OAuth callback URLs for GitHub and Google.
- Configure Razorpay webhook URLs and secrets.
