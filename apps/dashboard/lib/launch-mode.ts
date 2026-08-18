export const PAID_BILLING_ENABLED: boolean = false;

export const EARLY_ACCESS_COPY = {
  availability: "Free Early Access",
  paidAvailability: "Coming Soon",
  freeCta: "Join early access",
  paidCta: "Coming Soon",
  billingSummary: "Free Early Access without an active paid subscription",
  billingDeferred:
    "Live Razorpay payments are deferred while GitFuse launches in Free Early Access. Pro and Team remain Coming Soon.",
  checkoutDeferred:
    "Paid checkout is deferred while GitFuse launches in Free Early Access. Pro and Team remain Coming Soon.",
} as const;

export type LaunchPlanTier = "free" | "pro" | "team";

export type LaunchPlanCard = {
  tier: LaunchPlanTier;
  name: string;
  priceLabel: string;
  availability: string;
  description: string;
  features: readonly string[];
  ctaLabel: string;
  ctaHref?: string;
  ctaEnabled: boolean;
  highlighted?: boolean;
};

export const EARLY_ACCESS_PLAN_CARDS: readonly LaunchPlanCard[] = [
  {
    tier: "free",
    name: "Free",
    priceLabel: "$0",
    availability: EARLY_ACCESS_COPY.availability,
    description:
      "For individual developers joining GitFuse during the early-access launch.",
    features: ["3 devices", "5 repositories", "30-day sync history"],
    ctaLabel: EARLY_ACCESS_COPY.freeCta,
    ctaHref: "/login",
    ctaEnabled: true,
  },
  {
    tier: "pro",
    name: "Pro",
    priceLabel: EARLY_ACCESS_COPY.paidAvailability,
    availability: EARLY_ACCESS_COPY.paidAvailability,
    description:
      "For developers who will need larger private sync capacity after paid billing opens.",
    features: [
      "Unlimited devices",
      "Unlimited repositories",
      "Priority relay capacity",
    ],
    ctaLabel: EARLY_ACCESS_COPY.paidCta,
    ctaEnabled: false,
    highlighted: true,
  },
  {
    tier: "team",
    name: "Team",
    priceLabel: EARLY_ACCESS_COPY.paidAvailability,
    availability: EARLY_ACCESS_COPY.paidAvailability,
    description:
      "For teams planning shared workspace controls, audit history, and managed access.",
    features: ["Team dashboard", "Per-repo controls", "Audit history"],
    ctaLabel: EARLY_ACCESS_COPY.paidCta,
    ctaEnabled: false,
  },
];

export function launchPlanCard(tier: LaunchPlanTier) {
  return EARLY_ACCESS_PLAN_CARDS.find((plan) => plan.tier === tier);
}
