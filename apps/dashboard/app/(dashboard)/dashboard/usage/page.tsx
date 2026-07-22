"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DashboardDataError } from "@/components/dashboard/data-error";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  buildUsageMetrics,
  clampPercent,
  formatPercent,
  getUsageMetricPercent,
  type UsageMetricId,
} from "@/lib/usage-metrics";

export default function UsagePage() {
  const { data, error, loading } = useDashboardData();
  const [selectedMetricId, setSelectedMetricId] =
    useState<UsageMetricId>("repositories");
  const [isDetailListScrolling, setIsDetailListScrolling] = useState(false);
  const detailScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const usageMetrics = useMemo(() => buildUsageMetrics(data), [data]);

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
            const percentLabel = metric.isUnlimited
              ? "Unlimited"
              : formatPercent(percent);
            const isSelected = selectedMetricId === metric.id;
            const progressWidth = metric.isUnlimited
              ? "100%"
              : `${clampPercent(percent)}%`;

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

                <div className="gf-usage-metric-top">
                  <p>{metric.label}</p>
                  <span>{percentLabel}</span>
                </div>

                <div className="gf-usage-metric-main">
                  <div className="gf-usage-metric-value">
                    <strong>{metric.displayValue ?? metric.value}</strong>
                    <small> / {metric.displayLimit ?? metric.limit}</small>
                  </div>

                  <div
                    className={`gf-usage-progress ${
                      metric.isUnlimited ? "is-unlimited" : ""
                    }`}
                    aria-label={
                      metric.isUnlimited
                        ? `${metric.label} has unlimited capacity`
                        : `${metric.label} usage ${percent}%`
                    }
                  >
                    <i style={{ width: progressWidth }} />
                  </div>
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
              {selectedMetric?.isUnlimited
                ? "Unlimited"
                : formatPercent(
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
                      {" / "}
                      {selectedMetric.displayLimit ?? selectedMetric.limit}
                    </small>
                  </strong>
                  <p>{selectedMetric.unit}</p>
                </div>

                <div
                  className={`gf-usage-progress ${
                    selectedMetric.isUnlimited ? "is-unlimited" : ""
                  }`}
                >
                  <i
                    style={{
                      width: selectedMetric.isUnlimited
                        ? "100%"
                        : `${clampPercent(
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
    </div>
  );
}
