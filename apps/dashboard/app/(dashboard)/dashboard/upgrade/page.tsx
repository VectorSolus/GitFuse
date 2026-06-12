"use client";

import Link from "next/link";
import { useState } from "react";

type Plan = {
  name: string;
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

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    badge: "Current plan",
    current: true,
    description:
      "For personal testing, local development, and small private sync workflows.",
    features: [
      "5 tracked repositories",
      "3 trusted devices",
      "500 MB relay storage",
      "30 days sync history",
      "50 MB bundle size",
    ],
    limits: [
      { label: "Repositories", value: "5" },
      { label: "Devices", value: "3" },
      { label: "Storage", value: "500 MB" },
      { label: "History", value: "30 days" },
    ],
  },
  {
    name: "Pro",
    price: "$12",
    badge: "Recommended",
    highlighted: true,
    description:
      "For developers who move across machines and want larger private sync capacity.",
    features: [
      "Unlimited private repositories",
      "More trusted devices",
      "5 GB relay storage",
      "365 days sync history",
      "Larger encrypted bundles",
      "Priority workspace limits",
    ],
    limits: [
      { label: "Repositories", value: "Unlimited" },
      { label: "Devices", value: "10" },
      { label: "Storage", value: "5 GB" },
      { label: "History", value: "365 days" },
    ],
  },
  {
    name: "Team",
    price: "Custom",
    badge: "Upcoming",
    description:
      "For teams that need shared workspace controls, audit history, and managed access.",
    features: [
      "Team workspace access",
      "Shared repository controls",
      "Managed device access",
      "Audit-friendly sync history",
      "Repository-scoped API keys",
      "Priority support",
    ],
    limits: [
      { label: "Repositories", value: "Custom" },
      { label: "Devices", value: "Custom" },
      { label: "Storage", value: "Custom" },
      { label: "History", value: "Custom" },
    ],
  },
];

const comparisonRows = [
  {
    feature: "Private commit sync",
    free: "Included",
    pro: "Included",
    team: "Included",
  },
  {
    feature: "Tracked repositories",
    free: "5",
    pro: "Unlimited",
    team: "Custom",
  },
  {
    feature: "Trusted devices",
    free: "3",
    pro: "10",
    team: "Custom",
  },
  {
    feature: "Relay storage",
    free: "500 MB",
    pro: "5 GB",
    team: "Custom",
  },
  {
    feature: "Sync history",
    free: "30 days",
    pro: "365 days",
    team: "Custom",
  },
  {
    feature: "Repository-scoped API keys",
    free: "Upcoming",
    pro: "Upcoming",
    team: "Upcoming",
  },
];

export default function UpgradePage() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <div className="gf-upgrade-page">
      <section className="gf-upgrade-hero">
        <div>
          <p className="gf-dash-eyebrow">Upgrade plan</p>
          <h2>Scale your private sync workspace when you need more room.</h2>
          <span>
            Compare workspace limits for repositories, devices, storage, and
            sync history. Billing is frontend-ready and can be connected to
            Stripe checkout later.
          </span>
        </div>

        <div className="gf-upgrade-current-card">
          <p>Current plan</p>
          <strong>Free</strong>
          <span>5 repositories · 3 devices · 500 MB storage</span>
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
              <button type="button" onClick={() => setCheckoutOpen(true)}>
                {plan.name === "Team" ? "Contact later" : "Upgrade"}
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
          <strong>Checkout is not connected yet.</strong>
          <span>
            This page is a production-ready frontend shell. When the backend is
            ready, the upgrade buttons can create a Stripe checkout session and
            update the workspace plan automatically.
          </span>
        </div>
      </section>

      {checkoutOpen ? (
        <UpgradeModal onClose={() => setCheckoutOpen(false)} />
      ) : null}
    </div>
  );
}

function UpgradeModal({ onClose }: { onClose: () => void }) {
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
        <h2>Checkout will be connected later.</h2>
        <span>
          The frontend upgrade flow is ready. Once Stripe is wired, this button
          can create a checkout session and redirect the user securely.
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