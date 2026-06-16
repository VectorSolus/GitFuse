import {
  PLAN_LIMITS,
  effectivePlanTier,
  type PaidPlanTier,
  type PlanTier,
  type RazorpaySubscriptionStatus,
} from "@gitfuse/types/billing";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import { getSql } from "./db";

export type DashboardInvoice = {
  id: string;
  number: string;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  createdAt: string;
};

export type DashboardBilling = {
  tier: PlanTier;
  requestedTier: PlanTier;
  paymentProvider: "razorpay" | null;
  subscriptionStatus: RazorpaySubscriptionStatus | null;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  razorpayPlanId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  invoices: DashboardInvoice[];
};

type AccountLookup = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
};

type BillingRow = {
  user_id: string;
  user_name: string;
  user_email: string;
  tier: PlanTier | null;
  requested_tier: PlanTier | null;
  payment_provider: string | null;
  subscription_status: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean | null;
};

type RazorpaySubscriptionEntity = {
  id: string;
  plan_id?: string | null;
  customer_id?: string | null;
  status?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  notes?: Record<string, string | number> | null;
};

type RazorpayPaymentEntity = {
  id?: string | null;
  subscription_id?: string | null;
  status?: string | null;
};

type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  publicKeyId: string;
  appUrl: string;
  planId: string;
};

type RazorpaySafeError = {
  statusCode?: string | number;
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    field?: string;
  };
};

export type RazorpayWebhookEvent = {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
    payment?: { entity?: RazorpayPaymentEntity };
  };
};

export type RazorpayCheckoutResult =
  | {
      ok: true;
      provider: "razorpay";
      keyId: string;
      subscriptionId: string;
      name: string;
      email: string;
      plan: PaidPlanTier;
    }
  | {
      ok: false;
      error: string;
      message: string;
    };

const razorpayPlanEnv: Record<PaidPlanTier, string> = {
  pro: "RAZORPAY_PRO_PLAN_ID",
  team: "RAZORPAY_TEAM_PLAN_ID",
};

const paidStatuses = new Set(["active", "authenticated"]);
const terminalStatuses = new Set([
  "cancelled",
  "completed",
  "expired",
  "failed",
  "halted",
  "paused",
]);

let cachedRazorpay:
  | {
      keyId: string;
      keySecret: string;
      client: Razorpay;
    }
  | null = null;

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function timestampToIso(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function normalizeSubscriptionStatus(
  value: string | null | undefined,
): RazorpaySubscriptionStatus | null {
  const allowed = new Set<RazorpaySubscriptionStatus>([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "cancelled",
    "completed",
    "expired",
    "paused",
    "failed",
  ]);
  return value && allowed.has(value as RazorpaySubscriptionStatus)
    ? (value as RazorpaySubscriptionStatus)
    : null;
}

function planFromRazorpayPlanId(planId: string | null | undefined) {
  if (!planId) return null;
  if (planId === process.env.RAZORPAY_PRO_PLAN_ID) return "pro" as const;
  if (planId === process.env.RAZORPAY_TEAM_PLAN_ID) return "team" as const;
  return null;
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function maskIdentifier(value: string) {
  if (value.length <= 8) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function safeRazorpayError(error: unknown) {
  const razorpayError = error as RazorpaySafeError;
  return {
    statusCode: razorpayError.statusCode,
    code: razorpayError.error?.code,
    description: razorpayError.error?.description,
    reason: razorpayError.error?.reason,
    field: razorpayError.error?.field,
  };
}

export function getBillingConfigDiagnostics() {
  return {
    paymentProvider: process.env.PAYMENT_PROVIDER,
    hasRazorpayKeyId: Boolean(readEnv("RAZORPAY_KEY_ID")),
    hasRazorpayKeySecret: Boolean(readEnv("RAZORPAY_KEY_SECRET")),
    hasPublicRazorpayKeyId: Boolean(readEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID")),
    hasAppUrl: Boolean(readEnv("NEXT_PUBLIC_APP_URL")),
    hasProPlanId: Boolean(readEnv("RAZORPAY_PRO_PLAN_ID")),
    hasTeamPlanId: Boolean(readEnv("RAZORPAY_TEAM_PLAN_ID")),
  };
}

export function getRazorpayConfigForTier(
  tier: PaidPlanTier,
):
  | { ok: true; config: RazorpayConfig }
  | { ok: false; error: string } {
  const missing: string[] = [];
  const paymentProvider = readEnv("PAYMENT_PROVIDER");
  const keyId = readEnv("RAZORPAY_KEY_ID");
  const keySecret = readEnv("RAZORPAY_KEY_SECRET");
  const publicKeyId = readEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID");
  const appUrl = readEnv("NEXT_PUBLIC_APP_URL");
  const planEnvName = razorpayPlanEnv[tier];
  const planId = readEnv(planEnvName);

  if (paymentProvider !== "razorpay") {
    missing.push("PAYMENT_PROVIDER=razorpay");
  }
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");
  if (!publicKeyId) missing.push("NEXT_PUBLIC_RAZORPAY_KEY_ID");
  if (!appUrl) missing.push("NEXT_PUBLIC_APP_URL");
  if (!planId) missing.push(planEnvName);

  if (
    missing.length > 0 ||
    !keyId ||
    !keySecret ||
    !publicKeyId ||
    !appUrl ||
    !planId
  ) {
    const error = `Missing Razorpay config: ${missing.join(", ")}`;
    console.error(`[billing] ${error}`, getBillingConfigDiagnostics());
    return { ok: false, error };
  }

  return {
    ok: true,
    config: {
      keyId,
      keySecret,
      publicKeyId,
      appUrl,
      planId,
    },
  };
}

export const getRazorpayConfigForPlan = getRazorpayConfigForTier;

function emptyBilling(): DashboardBilling {
  return {
    tier: "free",
    requestedTier: "free",
    paymentProvider: null,
    subscriptionStatus: null,
    razorpayCustomerId: null,
    razorpaySubscriptionId: null,
    razorpayPlanId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    invoices: [],
  };
}

async function findBillingRow(account: AccountLookup) {
  if (!account.id && !account.email && !account.username) return null;

  const sql = getSql();
  const [row] = await sql<BillingRow[]>`
    with dashboard_user as (
      select id, github_username, email
      from users
      where (${account.id ?? null}::uuid is not null and id = ${account.id ?? null})
         or (${account.email ?? null}::text is not null and lower(email) = lower(${account.email ?? null}))
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by case when id = ${account.id ?? null}::uuid then 0 else 1 end,
               updated_at desc
      limit 1
    )
    select
      dashboard_user.id as user_id,
      dashboard_user.github_username as user_name,
      dashboard_user.email as user_email,
      plans.tier,
      plans.requested_tier,
      plans.payment_provider,
      plans.subscription_status,
      plans.razorpay_customer_id,
      plans.razorpay_subscription_id,
      plans.razorpay_plan_id,
      plans.current_period_start,
      plans.current_period_end,
      plans.cancel_at_period_end
    from dashboard_user
    left join plans on plans.user_id = dashboard_user.id
    limit 1
  `;

  return row ?? null;
}

async function loadFixtureBilling(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(fixturePath, "utf8")) as DashboardBilling;
}

export function getRazorpayClient(
  config?: Pick<RazorpayConfig, "keyId" | "keySecret">,
) {
  const keyId = config?.keyId ?? readEnv("RAZORPAY_KEY_ID");
  const keySecret = config?.keySecret ?? readEnv("RAZORPAY_KEY_SECRET");

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required");
  }

  if (
    cachedRazorpay &&
    cachedRazorpay.keyId === keyId &&
    cachedRazorpay.keySecret === keySecret
  ) {
    return cachedRazorpay.client;
  }

  cachedRazorpay = {
    keyId,
    keySecret,
    client: new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    }),
  };
  return cachedRazorpay.client;
}

export async function getDashboardBilling(
  account: AccountLookup,
  options: { fixturePath?: string | null } = {},
) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureBilling(options.fixturePath);
  }

  const row = await findBillingRow(account);
  if (!row) return emptyBilling();

  const requestedTier = row.requested_tier ?? row.tier ?? "free";
  const paymentProvider =
    row.payment_provider === "razorpay" ? "razorpay" : null;
  const subscriptionStatus = normalizeSubscriptionStatus(
    row.subscription_status,
  );

  return {
    tier: effectivePlanTier({
      tier: row.tier,
      requestedTier,
      paymentProvider,
      subscriptionStatus,
    }),
    requestedTier,
    paymentProvider,
    subscriptionStatus,
    razorpayCustomerId: row.razorpay_customer_id,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    razorpayPlanId: row.razorpay_plan_id,
    currentPeriodStart: toIso(row.current_period_start),
    currentPeriodEnd: toIso(row.current_period_end),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    invoices: [],
  } satisfies DashboardBilling;
}

export async function getEffectiveTier(userId: string) {
  return (await getDashboardBilling({ id: userId })).tier;
}

export function getPlanLimits(tier: PlanTier) {
  return PLAN_LIMITS[tier];
}

export async function createRazorpaySubscription(
  userId: string,
  tier: PaidPlanTier,
): Promise<RazorpayCheckoutResult> {
  const configResult = getRazorpayConfigForTier(tier);
  if (!configResult.ok) {
    return {
      ok: false,
      error: configResult.error,
      message: configResult.error,
    };
  }
  const { config } = configResult;

  const planValidation = await validateRazorpayPlan(tier, config);
  if (!planValidation.ok) {
    return {
      ok: false,
      error: planValidation.error,
      message: planValidation.error,
    };
  }

  const row = await findBillingRow({ id: userId });
  if (!row) {
    throw new Error("Authenticated GitFuse account was not found.");
  }

  const existingStatus = normalizeSubscriptionStatus(row.subscription_status);
  const existingRequestedTier = row.requested_tier ?? row.tier ?? "free";
  if (
    row.payment_provider === "razorpay" &&
    row.razorpay_subscription_id &&
    (existingStatus === "created" || existingStatus === "pending")
  ) {
    if (existingRequestedTier === tier) {
      return {
        ok: true,
        provider: "razorpay",
        keyId: config.publicKeyId,
        subscriptionId: row.razorpay_subscription_id,
        name: row.user_name,
        email: row.user_email,
        plan: tier,
      };
    }

    console.info("[billing] Replacing pending Razorpay checkout", {
      fromTier: existingRequestedTier,
      toTier: tier,
      subscriptionId: maskIdentifier(row.razorpay_subscription_id),
    });
  }

  if (
    row.payment_provider === "razorpay" &&
    existingStatus &&
    paidStatuses.has(existingStatus)
  ) {
    return {
      ok: false,
      error: "active_subscription_exists",
      message:
        "An active Razorpay subscription already controls this workspace. Manage that subscription before changing plans.",
    };
  }

  let subscription: RazorpaySubscriptionEntity;
  try {
    subscription = (await getRazorpayClient(config).subscriptions.create({
      plan_id: config.planId,
      total_count: 120,
      quantity: 1,
      customer_notify: true,
      notes: {
        gitfuse_user_id: row.user_id,
        gitfuse_tier: tier,
      },
    })) as RazorpaySubscriptionEntity;
  } catch (error) {
    console.error("[billing] Razorpay subscription creation failed", {
      tier,
      planId: maskIdentifier(config.planId),
      ...safeRazorpayError(error),
    });
    const description = safeRazorpayError(error).description;
    const message = description
      ? `Razorpay subscription creation failed for ${tier}: ${description}`
      : `Razorpay subscription creation failed for ${tier}. Check that ${razorpayPlanEnv[tier]} belongs to the same Test/Live mode as your API keys.`;
    return {
      ok: false,
      error: message,
      message,
    };
  }

  const sql = getSql();
  await sql`
    insert into plans (
      user_id,
      tier,
      requested_tier,
      payment_provider,
      razorpay_customer_id,
      razorpay_subscription_id,
      razorpay_plan_id,
      subscription_status,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    values (
      ${row.user_id},
      'free',
      ${tier},
      'razorpay',
      ${subscription.customer_id ?? null},
      ${subscription.id},
      ${config.planId},
      ${subscription.status ?? "created"},
      ${timestampToIso(subscription.current_start)},
      ${timestampToIso(subscription.current_end)},
      false
    )
    on conflict (user_id)
    do update set
      tier = case
        when plans.payment_provider = 'razorpay'
         and plans.subscription_status in ('active', 'authenticated')
        then plans.tier
        else 'free'
      end,
      requested_tier = excluded.requested_tier,
      payment_provider = excluded.payment_provider,
      razorpay_customer_id = coalesce(
        excluded.razorpay_customer_id,
        plans.razorpay_customer_id
      ),
      razorpay_subscription_id = excluded.razorpay_subscription_id,
      razorpay_plan_id = excluded.razorpay_plan_id,
      subscription_status = excluded.subscription_status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = false,
      updated_at = now()
  `;

  return {
    ok: true,
    provider: "razorpay",
    keyId: config.publicKeyId,
    subscriptionId: subscription.id,
    name: row.user_name,
    email: row.user_email,
    plan: tier,
  };
}

async function validateRazorpayPlan(tier: PaidPlanTier, config: RazorpayConfig) {
  try {
    await getRazorpayClient(config).plans.fetch(config.planId);
    return { ok: true as const };
  } catch (error) {
    console.error("[billing] Razorpay plan validation failed", {
      tier,
      planId: maskIdentifier(config.planId),
      ...safeRazorpayError(error),
    });
    return {
      ok: false as const,
      error: `Razorpay plan validation failed for ${tier}. Check that ${razorpayPlanEnv[tier]} belongs to the same Test/Live mode as your API keys.`,
    };
  }
}

export function verifyRazorpayCheckoutSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(input.signature, "utf8");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string | null,
) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  return Razorpay.validateWebhookSignature(body, signature, secret);
}

export async function verifyRazorpaySubscriptionOwnership(
  userId: string,
  subscriptionId: string,
) {
  const sql = getSql();
  const [row] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from plans
      where user_id = ${userId}
        and razorpay_subscription_id = ${subscriptionId}
    ) as exists
  `;
  return Boolean(row?.exists);
}

function eventStatus(event: RazorpayWebhookEvent) {
  const suppliedStatus =
    event.payload?.subscription?.entity?.status?.toLowerCase();
  if (suppliedStatus) return suppliedStatus;

  switch (event.event) {
    case "subscription.authenticated":
      return "authenticated";
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
    case "payment.captured":
      return "active";
    case "subscription.completed":
      return "completed";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.expired":
      return "expired";
    case "subscription.halted":
      return "halted";
    case "subscription.paused":
      return "paused";
    case "payment.failed":
      return "failed";
    default:
      return null;
  }
}

export async function syncRazorpaySubscriptionEvent(
  event: RazorpayWebhookEvent,
) {
  const subscription = event.payload?.subscription?.entity;
  const payment = event.payload?.payment?.entity;
  const subscriptionId = subscription?.id ?? payment?.subscription_id;
  if (!subscriptionId) return null;

  const sql = getSql();
  const [existing] = await sql<{
    id: string;
    requested_tier: PlanTier;
    razorpay_plan_id: string | null;
  }[]>`
    select id, requested_tier, razorpay_plan_id
    from plans
    where razorpay_subscription_id = ${subscriptionId}
    limit 1
  `;
  if (!existing) return null;

  const status = normalizeSubscriptionStatus(eventStatus(event));
  const planId = subscription?.plan_id ?? existing.razorpay_plan_id;
  const requestedTier =
    planFromRazorpayPlanId(planId) ?? existing.requested_tier;
  const effectiveTier =
    status && paidStatuses.has(status) ? requestedTier : "free";
  const shouldCancel =
    Boolean(status && terminalStatuses.has(status)) ||
    event.event === "subscription.cancelled";

  const [updated] = await sql<{
    id: string;
    tier: PlanTier;
    subscription_status: string | null;
  }[]>`
    update plans
    set tier = ${effectiveTier},
        requested_tier = ${requestedTier},
        payment_provider = 'razorpay',
        razorpay_customer_id = coalesce(
          ${subscription?.customer_id ?? null},
          razorpay_customer_id
        ),
        razorpay_plan_id = coalesce(${planId ?? null}, razorpay_plan_id),
        subscription_status = ${status},
        current_period_start = coalesce(
          ${timestampToIso(subscription?.current_start)},
          current_period_start
        ),
        current_period_end = coalesce(
          ${timestampToIso(
            subscription?.current_end ?? subscription?.ended_at,
          )},
          current_period_end
        ),
        cancel_at_period_end = ${shouldCancel},
        updated_at = now()
    where id = ${existing.id}
    returning id, tier, subscription_status
  `;

  return updated ?? null;
}

export function tierPriceLabel(tier: PlanTier) {
  if (tier === "free") return "$0";
  if (tier === "pro") return "$9/month";
  if (tier === "team") return "$18/user/month";
  return "Custom";
}

export function tierLimitSummary(tier: PlanTier) {
  const limits = PLAN_LIMITS[tier];
  return {
    repos:
      limits.repos === "unlimited"
        ? "Unlimited repos"
        : `${limits.repos} repos`,
    devices:
      limits.devices === "unlimited"
        ? "Unlimited devices"
        : `${limits.devices} devices`,
    history: `${limits.historyDays} days history`,
  };
}
