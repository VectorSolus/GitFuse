"use client";

import { PLAN_LIMITS } from "@gitfuse/types/billing";
import { useEffect, useMemo, useRef, useState } from "react";

import { DashboardDataError } from "@/components/dashboard/data-error";
import { useDashboardData, type DashboardData } from "@/hooks/use-dashboard-data";
import {
  buildUsageMetrics,
  clampPercent,
  formatBytes,
  formatLimit,
  formatPercent,
  getUsageMetricPercent,
  type UsageMetricId,
} from "@/lib/usage-metrics";

const proFeatures = [
  `${formatLimit(PLAN_LIMITS.pro.repos)} private repositories`,
  `${formatLimit(PLAN_LIMITS.pro.devices)} trusted devices`,
  `${PLAN_LIMITS.pro.historyDays} days sync history`,
  `${formatBytes(PLAN_LIMITS.pro.bundleSizeBytes)} bundle size`,
  `${formatBytes(PLAN_LIMITS.pro.storageTotalBytes)} relay storage`,
];

export default function UsagePage() {
  const { data, error, loading } = useDashboardData();
  const [selectedMetricId, setSelectedMetricId] =
    useState<UsageMetricId>("repositories");
  const [billingOpen, setBillingOpen] = useState(false);
  const [isDetailListScrolling, setIsDetailListScrolling] = useState(false);
  const detailScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const usageMetrics = useMemo(() => buildUsageMetrics(data), [data]);
  const planFeatures = useMemo(() => buildPlanFeatures(data), [data]);

  const selectedMetric = useMemo(() => {
    return usageMetrics.find((metric) => metric.id === selectedMetricId);
  }, [selectedMetricId, usageMetrics]);

  useEffect(() => {
    return () => {
      if (detailScrollTimeout.current) {
        clearTimeout(detailScrollTimeout.current);
      }
    };
  }, []);

  function handleDetailListScroll() {
    if (detailScrollTimeout.current) {
      clearTimeout(detailScrollTimeout.current);
    }

    setIsDetailListScrolling(true);
    detailScrollTimeout.current = setTimeout(() => {
      setIsDetailListScrolling(false);
      detailScrollTimeout.current = null;
    }, 900);
  }

  if (error && !loading) {
    return <DashboardDataError message={error} />;
  }

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
            const percent = getUsageMetricPercent(metric);
            const percentLabel = formatPercent(percent);
            const isSelected = selectedMetricId === metric.id;

            return (
              <button
                key={metric.id}
                type="button"
                className={`gf-usage-metric-card gf-usage-tone-${metric.tone} ${
                  isSelected ? "is-active" : ""
                }`}
                onClick={() => setSelectedMetricId(metric.id)}
                aria-label={`Show ${metric.label} details, ${metric.displayValue ?? metric.value} of ${metric.displayLimit ?? metric.limit}`}
                aria-pressed={isSelected}
              >
                <span className="gf-usage-card-tooltip">
                  Click for more details
                </span>

                <div className="gf-usage-metric-head">
                  <div>
                    <p>{metric.label}</p>
                    <strong>
                      {metric.displayValue ?? metric.value}
                      <small>/{metric.displayLimit ?? metric.limit}</small>
                    </strong>
                  </div>

                  <span>{percentLabel}</span>
                </div>

                <div
                  className="gf-usage-progress"
                  aria-label={`${metric.label} usage ${percent}%`}
                >
                  <i style={{ width: `${clampPercent(percent)}%` }} />
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
              {formatPercent(
                selectedMetric ? getUsageMetricPercent(selectedMetric) : 0,
              )}
            </span>
          </div>

          {selectedMetric ? (
            <>
              <div
                className={`gf-usage-large-progress gf-usage-tone-${selectedMetric.tone}`}
              >
                <div>
                  <strong>
                    {selectedMetric.displayValue ?? selectedMetric.value}
                    <small>
                      /{selectedMetric.displayLimit ?? selectedMetric.limit}
                    </small>
                  </strong>
                  <p>{selectedMetric.unit}</p>
                </div>

                <div className="gf-usage-progress">
                  <i
                    style={{
                      width: `${clampPercent(
                        getUsageMetricPercent(selectedMetric),
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

                <div
                  className={`gf-usage-detail-list-body usage-detail-scroll ${
                    isDetailListScrolling ? "is-scrolling" : ""
                  }`}
                  role="region"
                  aria-label={`${selectedMetric.rowsTitle} for ${selectedMetric.label}`}
                  tabIndex={0}
                  onScroll={handleDetailListScroll}
                >
                  {selectedMetric.rows.length > 0 ? (
                    selectedMetric.rows.map((row) => (
                      <div
                        key={`${selectedMetric.id}-${row.id}`}
                        className="gf-usage-detail-row"
                      >
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
            <h3>{titleCase(data?.billing.tier ?? "free")} workspace</h3>
          </div>

          <ul>
            {planFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>

        <article className="gf-usage-plan-panel gf-usage-plan-panel-pro">
          <div className="gf-usage-plan-panel-head">
            <p className="gf-dash-eyebrow">Upgrade option</p>
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
            Plan benefits follow the subscription state confirmed by Razorpay.
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
            Razorpay Checkout manages subscription authorization. Signed
            webhooks update account limits automatically.
          </span>

          <div className="gf-billing-plan-compare">
            <article>
              <p>Free</p>
              <h3>$0</h3>
              <ul>
                <li>{formatLimit(PLAN_LIMITS.free.repos)} repositories</li>
                <li>{formatLimit(PLAN_LIMITS.free.devices)} devices</li>
                <li>{formatBytes(PLAN_LIMITS.free.storageTotalBytes)} relay storage</li>
                <li>{PLAN_LIMITS.free.historyDays} days history</li>
              </ul>
            </article>

            <article className="is-featured">
              <p>Pro</p>
              <h3>$9</h3>
              <ul>
                <li>{formatLimit(PLAN_LIMITS.pro.repos)} repositories</li>
                <li>{formatLimit(PLAN_LIMITS.pro.devices)} trusted devices</li>
                <li>{PLAN_LIMITS.pro.historyDays} days history</li>
                <li>{formatBytes(PLAN_LIMITS.pro.bundleSizeBytes)} bundles</li>
              </ul>

              <button type="button">Continue later</button>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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
