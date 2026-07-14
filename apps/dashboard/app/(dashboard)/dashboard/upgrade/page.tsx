"use client";

import { PLAN_LIMITS, type PlanTier } from "@gitfuse/types/billing";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useDashboardData } from "@/hooks/use-dashboard-data";

type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: {
    name?: string;
    email?: string;
  };
  theme: {
    color: string;
  };
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  modal: {
    ondismiss: () => void;
  };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
    };
  }
}

type Plan = {
  name: string;
  tier: "free" | "pro" | "team";
  price: string;
  description: string;
  badge: string;
  current?: boolean;
  highlighted?: boolean;
  features: string[];
  limits: {
    label: string;
    value: string;
  }[];
};

function buildPlans(
  currentTier: string,
  prices: Partial<Record<"pro" | "team", string>>,
): Plan[] {
  return [
    {
      name: "Free",
      tier: "free",
      price: "$0",
      badge: currentTier === "free" ? "Current plan" : "Included",
      current: currentTier === "free",
      description:
        "For personal testing, local development, and small private sync workflows.",
      features: planCapacityFeatures("free"),
      limits: planCapacityLimits("free"),
    },
    {
      name: "Pro",
      tier: "pro",
      price: prices.pro ?? "$9/mo",
      badge: currentTier === "pro" ? "Current plan" : "Recommended",
      current: currentTier === "pro",
      highlighted: true,
      description:
        "For developers who move across machines and want larger private sync capacity.",
      features: [
        ...planCapacityFeatures("pro"),
        "Priority workspace limits",
      ],
      limits: planCapacityLimits("pro"),
    },
    {
      name: "Team",
      tier: "team",
      price: prices.team ?? "$18/user/mo",
      badge: currentTier === "team" ? "Current plan" : "For teams",
      current: currentTier === "team",
      description:
        "For teams that need shared workspace controls, audit history, and managed access.",
      features: [
        ...planCapacityFeatures("team"),
        "Team workspace access",
        "Shared repository controls",
        "Managed device access",
        "Repository-scoped API keys",
      ],
      limits: planCapacityLimits("team"),
    },
  ];
}

const comparisonRows = [
  {
    feature: "Private commit sync",
    free: "Included",
    pro: "Included",
    team: "Included",
  },
  {
    feature: "Tracked repositories",
    free: formatLimit(PLAN_LIMITS.free.repos),
    pro: formatLimit(PLAN_LIMITS.pro.repos),
    team: formatLimit(PLAN_LIMITS.team.repos),
  },
  {
    feature: "Trusted devices",
    free: formatLimit(PLAN_LIMITS.free.devices),
    pro: formatLimit(PLAN_LIMITS.pro.devices),
    team: formatLimit(PLAN_LIMITS.team.devices),
  },
  {
    feature: "Relay storage",
    free: formatBytes(PLAN_LIMITS.free.storageTotalBytes),
    pro: formatBytes(PLAN_LIMITS.pro.storageTotalBytes),
    team: formatBytes(PLAN_LIMITS.team.storageTotalBytes),
  },
  {
    feature: "Sync history",
    free: `${PLAN_LIMITS.free.historyDays} days`,
    pro: `${PLAN_LIMITS.pro.historyDays} days`,
    team: `${PLAN_LIMITS.team.historyDays} days`,
  },
  {
    feature: "Repository-scoped API keys",
    free: "Upcoming",
    pro: "Upcoming",
    team: "Upcoming",
  },
];

export default function UpgradePage() {
  const { data } = useDashboardData();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutPendingTier, setCheckoutPendingTier] = useState<
    "pro" | "team" | null
  >(null);
  const [priceLabels, setPriceLabels] = useState<
    Partial<Record<"pro" | "team", string>>
  >({});
  const currentTier = data?.billing.tier ?? "free";
  const plans = useMemo(() => buildPlans(currentTier, priceLabels), [currentTier, priceLabels]);

  useEffect(() => {
    let cancelled = false;
    async function loadPrices() {
      const entries = await Promise.all(
        (["pro", "team"] as const).map(async (tier) => {
          const response = await fetch(`/api/billing/price?tier=${tier}`, {
            cache: "no-store",
          });
          if (!response.ok) return [tier, null] as const;
          const price = (await response.json()) as {
            amount: number;
            currency: string;
          };
          return [tier, formatPrice(price.amount, price.currency)] as const;
        }),
      );
      if (!cancelled) {
        setPriceLabels(
          Object.fromEntries(
            entries.filter((entry): entry is readonly ["pro" | "team", string] => Boolean(entry[1])),
          ),
        );
      }
    }

    void loadPrices().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpgrade(plan: Plan) {
    if (plan.tier === "free") return;
    setCheckoutMessage("");
    setCheckoutPendingTier(plan.tier);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: plan.tier }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        keyId?: string;
        subscriptionId?: string;
        name?: string;
        email?: string;
        plan?: "pro" | "team";
        error?: string;
        message?: string;
      };

      if (
        !response.ok ||
        !payload.ok ||
        !payload.keyId ||
        !payload.subscriptionId ||
        !payload.plan
      ) {
        setCheckoutMessage(
          payload.message ??
            payload.error ??
            "Razorpay checkout is unavailable right now.",
        );
        setCheckoutOpen(true);
        setCheckoutPendingTier(null);
        return;
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout loaded, but window.Razorpay is unavailable.");
      }

      const checkout = new window.Razorpay({
        key: payload.keyId,
        subscription_id: payload.subscriptionId,
        name: "GitFuse",
        description: `GitFuse ${titleCase(payload.plan)}`,
        prefill: {
          name: payload.name,
          email: payload.email,
        },
        theme: {
          color: "#0890f2",
        },
        handler: async (checkoutResponse) => {
          const verification = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(checkoutResponse),
          });

          if (!verification.ok) {
            setCheckoutMessage(
              "Payment authorization could not be verified. Your plan was not changed.",
            );
            setCheckoutOpen(true);
            setCheckoutPendingTier(null);
            return;
          }

          window.location.assign("/dashboard/upgrade?checkout=success");
        },
        modal: {
          ondismiss: () => setCheckoutPendingTier(null),
        },
      });
      checkout.open();
    } catch (error) {
      setCheckoutMessage(
        error instanceof Error
          ? error.message
          : "Razorpay checkout is unavailable right now.",
      );
      setCheckoutOpen(true);
      setCheckoutPendingTier(null);
    }
  }

  return (
    <div className="gf-upgrade-page">
      <section className="gf-upgrade-hero">
        <div>
          <p className="gf-dash-eyebrow">Upgrade plan</p>
          <h2>Scale your private sync workspace when you need more room.</h2>
          <span>
            Compare workspace limits for repositories, devices, storage, and
            sync history. Upgrades are securely authorized through Razorpay
            Checkout.
          </span>
        </div>

        <div className="gf-upgrade-current-card">
          <p>Current plan</p>
          <strong>{titleCase(currentTier)}</strong>
          <span>
            {formatLimit(data?.usage.repos.max ?? 5)} repositories ·{" "}
            {formatLimit(data?.usage.devices.max ?? 3)} devices ·{" "}
            {formatBytes(data?.usage.storage.maxBytes ?? 500 * 1024 * 1024)} storage
          </span>
          <Link href="/dashboard/settings?section=billing">
            Billing settings
          </Link>
        </div>
      </section>

      <section className="gf-upgrade-plan-grid">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`gf-upgrade-plan-card ${
              plan.highlighted ? "is-highlighted" : ""
            }`}
          >
            <div className="gf-upgrade-plan-top">
              <span>{plan.badge}</span>
              <h3>{plan.name}</h3>
              <strong>{plan.price}</strong>
              <p>{plan.description}</p>
            </div>

            <div className="gf-upgrade-limit-grid">
              {plan.limits.map((limit) => (
                <div key={limit.label}>
                  <strong>{limit.value}</strong>
                  <span>{limit.label}</span>
                </div>
              ))}
            </div>

            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <CheckIcon />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {plan.current ? (
              <button type="button" disabled>
                Current plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(plan)}
                disabled={checkoutPendingTier === plan.tier}
              >
                {checkoutPendingTier === plan.tier ? "Opening..." : "Upgrade"}
              </button>
            )}
          </article>
        ))}
      </section>

      <section className="gf-upgrade-compare-card">
        <div className="gf-upgrade-section-head">
          <div>
            <p className="gf-dash-eyebrow">Compare</p>
            <h3>Plan limits</h3>
          </div>

          <Link href="/dashboard/settings?section=billing">
            Open billing settings
            <ExternalArrowIcon />
          </Link>
        </div>

        <div className="gf-upgrade-compare-table">
          <div className="gf-upgrade-compare-row gf-upgrade-compare-header">
            <span>Feature</span>
            <span>Free</span>
            <span>Pro</span>
            <span>Team</span>
          </div>

          {comparisonRows.map((row) => (
            <div key={row.feature} className="gf-upgrade-compare-row">
              <span>{row.feature}</span>
              <span>{row.free}</span>
              <span>{row.pro}</span>
              <span>{row.team}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="gf-upgrade-note-card">
        <div>
          <p className="gf-dash-eyebrow">Billing status</p>
          <strong>Razorpay subscription billing</strong>
          <span>
            Razorpay activates plan benefits only after a signed webhook
            confirms the subscription.
          </span>
        </div>
      </section>

      {checkoutOpen ? (
        <UpgradeModal
          message={checkoutMessage}
          onClose={() => setCheckoutOpen(false)}
        />
      ) : null}
    </div>
  );
}

function UpgradeModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="gf-upgrade-modal" role="dialog" aria-modal="true">
      <div className="gf-upgrade-modal-backdrop" onClick={onClose} />

      <section className="gf-upgrade-modal-card">
        <button
          type="button"
          className="gf-upgrade-modal-close"
          onClick={onClose}
          aria-label="Close upgrade modal"
        >
          <CloseIcon />
        </button>

        <p className="gf-dash-eyebrow">Upgrade</p>
        <h2>Checkout is unavailable.</h2>
        <span>
          {message ||
            "Razorpay checkout could not be started. Check the billing configuration and try again."}
        </span>

        <div className="gf-upgrade-modal-actions">
          <Link href="/dashboard/settings?section=billing">
            Billing settings
          </Link>

          <button type="button" onClick={onClose}>
            Continue preview
          </button>
        </div>
      </section>
    </div>
  );
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;

  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
  );
  if (existingScript) {
    if (window.Razorpay) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Razorpay Checkout timed out.")),
        10_000,
      );
      existingScript.addEventListener("load", () => resolve(), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () =>
          reject(
            new Error("Could not load Razorpay Checkout. Please try again."),
          ),
        { once: true },
      );
      existingScript.addEventListener(
        "load",
        () => window.clearTimeout(timeout),
        { once: true },
      );
      existingScript.addEventListener(
        "error",
        () => window.clearTimeout(timeout),
        { once: true },
      );
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Razorpay Checkout. Please try again."));
    document.head.appendChild(script);
  });
}

function planCapacityFeatures(tier: PlanTier) {
  const limits = PLAN_LIMITS[tier];
  return [
    `${formatLimit(limits.repos)} private repositories`,
    `${formatLimit(limits.devices)} trusted devices`,
    `${formatBytes(limits.storageTotalBytes)} relay storage`,
    `${limits.historyDays} days sync history`,
    `${formatBytes(limits.bundleSizeBytes)} bundle size`,
  ];
}

function planCapacityLimits(tier: PlanTier) {
  const limits = PLAN_LIMITS[tier];
  return [
    { label: "Repositories", value: formatLimit(limits.repos) },
    { label: "Devices", value: formatLimit(limits.devices) },
    { label: "Storage", value: formatBytes(limits.storageTotalBytes) },
    { label: "History", value: `${limits.historyDays} days` },
  ];
}

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatPrice(amount: number, currency: string) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return `${new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)}/mo`;
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
