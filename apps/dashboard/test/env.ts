const defaultTestDatabaseUrl = "postgresql://localhost:5432/gitfuse_db";
const defaultLocalAppUrl = "http://localhost:3000";

const clearedEnvNames = [
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "PAYMENT_PROVIDER",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_PRO_PLAN_ID",
  "RAZORPAY_TEAM_PLAN_ID",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
] as const;

export function dashboardTestDatabaseUrl() {
  const explicitTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  return explicitTestDatabaseUrl && explicitTestDatabaseUrl.length > 0
    ? explicitTestDatabaseUrl
    : defaultTestDatabaseUrl;
}

export function installDashboardTestEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  process.env.DATABASE_URL =
    overrides.DATABASE_URL ?? dashboardTestDatabaseUrl();
  process.env.AUTH_SECRET = overrides.AUTH_SECRET ?? "test-auth-secret";
  process.env.NEXTAUTH_SECRET =
    overrides.NEXTAUTH_SECRET ?? "test-nextauth-secret";
  process.env.AUTH_URL = overrides.AUTH_URL ?? defaultLocalAppUrl;
  process.env.NEXTAUTH_URL = overrides.NEXTAUTH_URL ?? defaultLocalAppUrl;
  process.env.NEXT_PUBLIC_APP_URL =
    overrides.NEXT_PUBLIC_APP_URL ?? defaultLocalAppUrl;
  process.env.PAIRING_PIN_ENCRYPTION_KEY =
    overrides.PAIRING_PIN_ENCRYPTION_KEY ??
    "0123456789abcdef0123456789abcdef";

  for (const name of clearedEnvNames) {
    delete process.env[name];
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    process.env[name] = value;
  }

  return process.env;
}

installDashboardTestEnv();
