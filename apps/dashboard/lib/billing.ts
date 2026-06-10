import { TIER_LIMITS, type PlanTier } from "@gitfuse/types/billing";

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
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  currentPeriodEnd: string | null;
  invoices: DashboardInvoice[];
};

type AccountLookup = {
  email?: string | null;
  username?: string | null;
};

type BillingRow = {
  tier: PlanTier | null;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  current_period_end: Date | string | null;
};

type CheckoutInput = AccountLookup & {
  tier: Extract<PlanTier, "pro" | "team">;
  successUrl: string;
  cancelUrl: string;
  checkoutLog?: string | null;
};

type StripeInvoice = {
  id: string;
  number?: string | null;
  amount_paid?: number | null;
  currency?: string | null;
  hosted_invoice_url?: string | null;
  created?: number | null;
};

const stripePriceEnv: Record<Extract<PlanTier, "pro" | "team">, string> = {
  pro: "STRIPE_PRO_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID"
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function stripeKey() {
  return process.env.STRIPE_SECRET_KEY;
}

function planFromPrice(priceId?: string | null): PlanTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "team";
  return null;
}

async function loadFixtureBilling(fixturePath: string) {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(fixturePath, "utf8")) as DashboardBilling;
}

async function loadStripeInvoices(stripeCustomerId: string | null): Promise<DashboardInvoice[]> {
  const key = stripeKey();
  if (!key || !stripeCustomerId) return [];

  const params = new URLSearchParams({ customer: stripeCustomerId, limit: "5" });
  const response = await fetch(`https://api.stripe.com/v1/invoices?${params.toString()}`, {
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store"
  });
  if (!response.ok) return [];

  const payload = (await response.json()) as { data?: StripeInvoice[] };
  return (payload.data ?? []).map((invoice) => ({
    id: invoice.id,
    number: invoice.number ?? invoice.id,
    amountPaid: invoice.amount_paid ?? 0,
    currency: (invoice.currency ?? "usd").toUpperCase(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    createdAt: new Date((invoice.created ?? 0) * 1000).toISOString()
  }));
}

export async function getDashboardBilling(account: AccountLookup, options: { fixturePath?: string | null } = {}) {
  if (process.env.NODE_ENV !== "production" && options.fixturePath) {
    return loadFixtureBilling(options.fixturePath);
  }

  if (!account.email && !account.username) {
    return {
      tier: "free" as PlanTier,
      stripeCustomerId: null,
      stripeSubId: null,
      currentPeriodEnd: null,
      invoices: []
    };
  }

  const sql = getSql();
  const [row] = await sql<BillingRow[]>`
    with dashboard_user as (
      select id
      from users
      where (${account.email ?? null}::text is not null and email = ${account.email ?? null})
         or (${account.username ?? null}::text is not null and github_username = ${account.username ?? null})
      order by updated_at desc
      limit 1
    )
    select plans.tier, plans.stripe_customer_id, plans.stripe_sub_id, plans.current_period_end
    from dashboard_user
    left join plans on plans.user_id = dashboard_user.id
    limit 1
  `;

  const billing: DashboardBilling = {
    tier: row?.tier ?? ("free" as PlanTier),
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubId: row?.stripe_sub_id ?? null,
    currentPeriodEnd: toIso(row?.current_period_end ?? null),
    invoices: []
  };
  billing.invoices = await loadStripeInvoices(billing.stripeCustomerId);
  return billing;
}

export async function createBillingCheckoutSession(input: CheckoutInput) {
  const priceId = process.env[stripePriceEnv[input.tier]];
  if (!priceId) throw new Error(`${stripePriceEnv[input.tier]} is required`);

  if (process.env.NODE_ENV !== "production" && input.checkoutLog) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(input.checkoutLog, `tier=${input.tier} email=${input.email ?? ""} price=${priceId}\n`);
    return { url: input.successUrl };
  }

  const key = stripeKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is required");

  const params = new URLSearchParams({
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[tier]": input.tier
  });
  if (input.email) params.set("customer_email", input.email);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Stripe checkout failed with status ${response.status}`);

  const session = (await response.json()) as { url?: string | null };
  if (!session.url) throw new Error("Stripe checkout session did not include a url");
  return { url: session.url };
}

export async function applyStripeSubscription(input: {
  stripeCustomerId: string;
  stripeSubId: string;
  priceId?: string | null;
  currentPeriodEnd?: number | null;
}) {
  const tier = planFromPrice(input.priceId) ?? "pro";
  const currentPeriodEnd = input.currentPeriodEnd
    ? new Date(input.currentPeriodEnd * 1000).toISOString()
    : null;

  const sql = getSql();
  const [plan] = await sql<{ id: string; tier: PlanTier }[]>`
    update plans
    set
      tier = ${tier},
      stripe_customer_id = ${input.stripeCustomerId},
      stripe_sub_id = ${input.stripeSubId},
      current_period_end = ${currentPeriodEnd},
      updated_at = now()
    where stripe_customer_id = ${input.stripeCustomerId}
       or stripe_sub_id = ${input.stripeSubId}
    returning id, tier
  `;
  return plan ?? null;
}

export function tierPriceLabel(tier: PlanTier) {
  if (tier === "free") return "$0";
  if (tier === "pro") return "$9/month";
  if (tier === "team") return "$18/user/month";
  return "Custom";
}

export function tierLimitSummary(tier: PlanTier) {
  const limits = TIER_LIMITS[tier];
  return {
    repos: limits.repos === "unlimited" ? "Unlimited repos" : `${limits.repos} repos`,
    devices: limits.devices === "unlimited" ? "Unlimited devices" : `${limits.devices} devices`,
    history: `${limits.historyDays} days history`
  };
}
