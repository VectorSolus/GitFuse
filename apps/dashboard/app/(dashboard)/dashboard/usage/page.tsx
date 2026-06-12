"use client";

import { useMemo, useState } from "react";

import { useDashboardData, type DashboardData } from "@/hooks/use-dashboard-data";

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

const proFeatures = [
  "Unlimited private repositories",
  "Unlimited trusted devices",
  "365 days sync history",
  "500 MB bundle size",
  "50 GB relay storage",
];

export default function UsagePage() {
  const { data } = useDashboardData();
  const [selectedMetricId, setSelectedMetricId] =
    useState<UsageMetricId>("repositories");
  const [billingOpen, setBillingOpen] = useState(false);
  const usageMetrics = useMemo(() => buildUsageMetrics(data), [data]);
  const planFeatures = useMemo(() => buildPlanFeatures(data), [data]);

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
          <strong>{titleCase(data?.billing.tier ?? "free")} tier active</strong>
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

function buildUsageMetrics(data: DashboardData | null): UsageMetric[] {
  const usage = data?.usage;
  const repos = data?.repositories ?? [];
  const devices = data?.devices ?? [];
  const history = data?.history ?? [];
  const repoLimit = usage?.repos.max === "unlimited" ? Math.max(usage.repos.current, 1) : usage?.repos.max ?? 5;
  const deviceLimit =
    usage?.devices.max === "unlimited" ? Math.max(usage.devices.current, 1) : usage?.devices.max ?? 3;
  const storageLimitMb = bytesToMb(usage?.storage.maxBytes ?? 500 * 1024 * 1024);
  const storageCurrentMb = bytesToMb(usage?.storage.currentBytes ?? 0);
  const bundleLimitMb = bytesToMb(usage?.bundleSize.maxBytes ?? 50 * 1024 * 1024);

  return [
    {
      id: "repositories",
      label: "Repositories",
      value: usage?.repos.current ?? 0,
      limit: repoLimit,
      unit: "repos",
      helper: "tracked repositories",
      detail:
        "Repositories show the Git workspaces currently tracked by GitFuse. The count includes repositories that have been added through the CLI and are ready for private sync.",
      tone: "ocean",
      rowsTitle: "Synced repositories",
      emptyText: "No repositories have been synced yet.",
      rows: repos.map((repo) => ({
        name: repo.displayName,
        meta: repo.relayEntryId,
        value: `${repo.activeBundleCount} bundles`,
      })),
    },
    {
      id: "devices",
      label: "Devices",
      value: usage?.devices.current ?? 0,
      limit: deviceLimit,
      unit: "devices",
      helper: "trusted machines",
      detail:
        "Devices are trusted machines linked to your GitFuse account. Each device can push or pull private commit bundles after authentication.",
      tone: "green",
      rowsTitle: "Linked devices",
      emptyText: "No devices are linked yet.",
      rows: devices.map((device) => ({
        name: device.name,
        meta: device.lastActiveAt ? `Last active ${formatDate(device.lastActiveAt)}` : "No activity recorded",
        value: device.status,
      })),
    },
    {
      id: "storage",
      label: "Storage",
      value: storageCurrentMb,
      limit: storageLimitMb,
      unit: "MB",
      helper: "private relay storage",
      detail:
        "Storage is used by encrypted commit bundles waiting in the private relay. Cleaning old bundles or upgrading the plan can increase available space later.",
      tone: "violet",
      rowsTitle: "Storage breakdown",
      emptyText: "No storage has been used yet.",
      rows: repos
        .filter((repo) => repo.activeStorageBytes > 0)
        .map((repo) => ({
          name: repo.displayName,
          meta: "Encrypted relay payloads",
          value: formatBytes(repo.activeStorageBytes),
        })),
    },
    {
      id: "history",
      label: "History retention",
      value: usage?.historyDays ?? 30,
      limit: usage?.historyDays ?? 30,
      unit: "days",
      helper: "history kept on current tier",
      detail:
        "History retention controls how long sync events remain visible in the dashboard. Current plan limits come from the workspace billing tier.",
      tone: "amber",
      rowsTitle: "History coverage",
      emptyText: "No sync history is available yet.",
      rows: history.map((event) => ({
        name: event.repositoryName,
        meta: `${event.eventType} by ${event.deviceName}`,
        value: formatDate(event.createdAt),
      })),
    },
    {
      id: "bundle",
      label: "Bundle size limit",
      value: bundleLimitMb,
      limit: bundleLimitMb,
      unit: "MB",
      helper: "maximum per sync",
      detail:
        "Bundle size is the maximum encrypted payload GitFuse can move in a single sync operation. Larger bundles can be enabled later through billing.",
      tone: "blue",
      rowsTitle: "Recent bundle sizes",
      emptyText: "No bundles have been created yet.",
      rows: repos
        .filter((repo) => repo.activeBundleCount > 0)
        .map((repo) => ({
          name: repo.displayName,
          meta: `${repo.activeBundleCount} active bundles`,
          value: formatBytes(repo.activeStorageBytes),
        })),
    },
  ];
}

function buildPlanFeatures(data: DashboardData | null) {
  const usage = data?.usage;
  return [
    `${formatLimit(usage?.repos.max ?? 5)} tracked repositories`,
    `${formatLimit(usage?.devices.max ?? 3)} trusted devices`,
    `${formatBytes(usage?.storage.maxBytes ?? 500 * 1024 * 1024)} relay storage`,
    `${usage?.historyDays ?? 30} days sync history`,
    `${formatBytes(usage?.bundleSize.maxBytes ?? 50 * 1024 * 1024)} bundle size`,
  ];
}

function bytesToMb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
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

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
