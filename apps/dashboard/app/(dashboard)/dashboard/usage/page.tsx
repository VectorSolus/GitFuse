"use client";

import { useMemo, useState } from "react";

type UsageMetricId = "repositories" | "devices" | "storage" | "history" | "bundle";

type UsageDetailRow = {
  name: string;
  meta: string;
  value?: string;
};

type UsageMetric = {
  id: UsageMetricId;
  label: string;
  value: number;
  limit: number;
  unit: string;
  helper: string;
  detail: string;
  tone: "ocean" | "green" | "violet" | "amber" | "blue";
  rowsTitle: string;
  emptyText: string;
  rows: UsageDetailRow[];
};

const usageMetrics: UsageMetric[] = [
  {
    id: "repositories",
    label: "Repositories",
    value: 3,
    limit: 5,
    unit: "repos",
    helper: "tracked repositories",
    detail:
      "Repositories show the Git workspaces currently tracked by GitFuse. The count includes repositories that have been added through the CLI and are ready for private sync.",
    tone: "ocean",
    rowsTitle: "Synced repositories",
    emptyText: "No repositories have been synced yet.",
    rows: [
      {
        name: "gitfuse-dashboard",
        meta: "main branch",
        value: "8 commits",
      },
      {
        name: "gitfuse-cli",
        meta: "auth-flow branch",
        value: "3 commits",
      },
      {
        name: "relay-service",
        meta: "transport branch",
        value: "2 commits",
      },
    ],
  },
  {
    id: "devices",
    label: "Devices",
    value: 2,
    limit: 3,
    unit: "devices",
    helper: "trusted machines",
    detail:
      "Devices are trusted machines linked to your GitFuse account. Each device can push or pull private commit bundles after authentication.",
    tone: "green",
    rowsTitle: "Linked devices",
    emptyText: "No devices are linked yet.",
    rows: [
      {
        name: "Piyush’s MacBook Pro",
        meta: "Last active today",
        value: "Primary",
      },
      {
        name: "Workstation",
        meta: "Last active yesterday",
        value: "Trusted",
      },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    value: 126,
    limit: 500,
    unit: "MB",
    helper: "private relay storage",
    detail:
      "Storage is used by encrypted commit bundles waiting in the private relay. Cleaning old bundles or upgrading the plan can increase available space later.",
    tone: "violet",
    rowsTitle: "Storage breakdown",
    emptyText: "No storage has been used yet.",
    rows: [
      {
        name: "Commit bundles",
        meta: "Encrypted relay payloads",
        value: "96 MB",
      },
      {
        name: "Sync metadata",
        meta: "Repository and device indexes",
        value: "18 MB",
      },
      {
        name: "History records",
        meta: "Recent sync events",
        value: "12 MB",
      },
    ],
  },
  {
    id: "history",
    label: "History retention",
    value: 30,
    limit: 365,
    unit: "days",
    helper: "history kept on free tier",
    detail:
      "History retention controls how long sync events remain visible in the dashboard. Free workspaces currently keep the latest 30 days.",
    tone: "amber",
    rowsTitle: "History coverage",
    emptyText: "No sync history is available yet.",
    rows: [
      {
        name: "Current retention",
        meta: "Free workspace limit",
        value: "30 days",
      },
      {
        name: "Oldest visible event",
        meta: "Based on current retention",
        value: "May 13",
      },
      {
        name: "Available with Pro",
        meta: "Future billing connection",
        value: "365 days",
      },
    ],
  },
  {
    id: "bundle",
    label: "Bundle size limit",
    value: 50,
    limit: 250,
    unit: "MB",
    helper: "maximum per sync",
    detail:
      "Bundle size is the maximum encrypted payload GitFuse can move in a single sync operation. Larger bundles can be enabled later through billing.",
    tone: "blue",
    rowsTitle: "Recent bundle sizes",
    emptyText: "No bundles have been created yet.",
    rows: [
      {
        name: "gitfuse-dashboard",
        meta: "Latest sync bundle",
        value: "18 MB",
      },
      {
        name: "gitfuse-cli",
        meta: "Latest sync bundle",
        value: "7 MB",
      },
      {
        name: "relay-service",
        meta: "Latest sync bundle",
        value: "31 MB",
      },
    ],
  },
];

const planFeatures = [
  "5 tracked repositories",
  "3 trusted devices",
  "500 MB relay storage",
  "30 days sync history",
  "50 MB bundle size",
];

const proFeatures = [
  "Unlimited private repositories",
  "More trusted devices",
  "365 days sync history",
  "Larger encrypted bundles",
  "Priority workspace limits",
];

export default function UsagePage() {
  const [selectedMetricId, setSelectedMetricId] =
    useState<UsageMetricId>("repositories");
  const [billingOpen, setBillingOpen] = useState(false);

  const selectedMetric = useMemo(() => {
    return usageMetrics.find((metric) => metric.id === selectedMetricId);
  }, [selectedMetricId]);

  return (
    <div className="gf-usage-page">
      <section className="gf-usage-hero">
        <div>
          <p className="gf-dash-eyebrow">Usage</p>
          <h2>Track your workspace limits before they slow you down.</h2>
          <span>
            Monitor repositories, devices, storage, history retention, and sync
            bundle limits from one clean workspace usage view.
          </span>
        </div>
      </section>

      <section className="gf-usage-layout">
        <div className="gf-usage-metrics-grid">
          {usageMetrics.map((metric) => {
            const percent = getPercent(metric.value, metric.limit);

            return (
              <button
                key={metric.id}
                type="button"
                className={`gf-usage-metric-card gf-usage-tone-${metric.tone} ${
                  selectedMetricId === metric.id ? "is-active" : ""
                }`}
                onClick={() => setSelectedMetricId(metric.id)}
                aria-label={`Show ${metric.label} details`}
              >
                <span className="gf-usage-card-tooltip">
                  Click for more details
                </span>

                <div className="gf-usage-metric-head">
                  <div>
                    <p>{metric.label}</p>
                    <strong>
                      {metric.value}
                      <small>/{metric.limit}</small>
                    </strong>
                  </div>

                  <span>{percent}%</span>
                </div>

                <div
                  className="gf-usage-progress"
                  aria-label={`${metric.label} usage ${percent}%`}
                >
                  <i style={{ width: `${percent}%` }} />
                </div>

                <div className="gf-usage-metric-foot">
                  <span>{metric.helper}</span>
                  <code>{metric.unit}</code>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="gf-usage-detail-panel">
          <div className="gf-usage-detail-header">
            <div>
              <p className="gf-dash-eyebrow">Selected limit</p>
              <h3>{selectedMetric?.label}</h3>
            </div>

            <span>
              {getPercent(selectedMetric?.value ?? 0, selectedMetric?.limit ?? 1)}
              %
            </span>
          </div>

          {selectedMetric ? (
            <>
              <div
                className={`gf-usage-large-progress gf-usage-tone-${selectedMetric.tone}`}
              >
                <div>
                  <strong>
                    {selectedMetric.value}
                    <small>/{selectedMetric.limit}</small>
                  </strong>
                  <p>{selectedMetric.unit}</p>
                </div>

                <div className="gf-usage-progress">
                  <i
                    style={{
                      width: `${getPercent(
                        selectedMetric.value,
                        selectedMetric.limit,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <p className="gf-usage-detail-copy">{selectedMetric.detail}</p>

              <div className="gf-usage-detail-list">
                <div className="gf-usage-detail-list-head">
                  <span>{selectedMetric.rowsTitle}</span>
                  <strong>{selectedMetric.rows.length}</strong>
                </div>

                {selectedMetric.rows.length > 0 ? (
                  selectedMetric.rows.map((row) => (
                    <div key={`${selectedMetric.id}-${row.name}`} className="gf-usage-detail-row">
                      <div>
                        <strong>{row.name}</strong>
                        <p>{row.meta}</p>
                      </div>

                      {row.value ? <span>{row.value}</span> : null}
                    </div>
                  ))
                ) : (
                  <div className="gf-usage-detail-empty">
                    {selectedMetric.emptyText}
                  </div>
                )}
              </div>

              <div className="gf-usage-tip-card">
                <span>CLI check</span>
                <code>gitfuse usage</code>
              </div>
            </>
          ) : null}
        </aside>
      </section>

      <section className="gf-usage-plan-grid">
        <article className="gf-usage-plan-panel">
          <div className="gf-usage-plan-panel-head">
            <p className="gf-dash-eyebrow">Included now</p>
            <h3>Free workspace</h3>
          </div>

          <ul>
            {planFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>

        <article className="gf-usage-plan-panel gf-usage-plan-panel-pro">
          <div className="gf-usage-plan-panel-head">
            <p className="gf-dash-eyebrow">Available later</p>
            <h3>Pro workspace</h3>
          </div>

          <ul>
            {proFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="gf-usage-billing-strip">
        <div>
          <p className="gf-dash-eyebrow">Billing</p>
          <strong>Free tier active</strong>
          <span>
            Plan changes are available from billing when the backend connection
            is ready.
          </span>
        </div>

        <button type="button" onClick={() => setBillingOpen(true)}>
          View billing
        </button>
      </section>

      {billingOpen ? (
        <BillingModal onClose={() => setBillingOpen(false)} />
      ) : null}
    </div>
  );
}

function BillingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="gf-billing-modal" role="dialog" aria-modal="true">
      <div className="gf-billing-modal-backdrop" onClick={onClose} />

      <section className="gf-billing-modal-panel">
        <button
          type="button"
          className="gf-billing-modal-close"
          onClick={onClose}
          aria-label="Close billing"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="gf-billing-modal-content">
          <p className="gf-dash-eyebrow">Billing</p>
          <h2>Manage your GitFuse workspace plan.</h2>
          <span>
            Billing is frontend-only for now. When Stripe is connected, this
            screen can create checkout sessions, manage invoices, and update
            account limits automatically.
          </span>

          <div className="gf-billing-plan-compare">
            <article>
              <p>Free</p>
              <h3>$0</h3>
              <ul>
                <li>5 repositories</li>
                <li>3 devices</li>
                <li>500 MB relay storage</li>
                <li>30 days history</li>
              </ul>
            </article>

            <article className="is-featured">
              <p>Pro</p>
              <h3>$12</h3>
              <ul>
                <li>Unlimited repositories</li>
                <li>More trusted devices</li>
                <li>365 days history</li>
                <li>Larger encrypted bundles</li>
              </ul>

              <button type="button">Continue later</button>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

function getPercent(value: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}