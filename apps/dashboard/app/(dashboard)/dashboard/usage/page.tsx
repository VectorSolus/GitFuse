import { redirect } from "next/navigation";

import { auth } from "../../../../lib/auth";
import { type DashboardUsage, getDashboardUsage } from "../../../../lib/usage";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function formatDate(value: string | null) {
  if (!value) return "No active bundles";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function percent(current: number, max: number | "unlimited") {
  if (max === "unlimited" || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

function UsageMeter({ label, current, max, percent }: { label: string; current: string; max: string; percent: number }) {
  return (
    <div className="usage-meter">
      <div>
        <span>{label}</span>
        <strong>
          {current} / {max}
        </strong>
      </div>
      <div className="usage-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default async function UsagePage() {
  const testEmail = process.env.NODE_ENV !== "production" ? process.env.GITFUSE_TEST_DASHBOARD_EMAIL : undefined;
  const session = testEmail ? null : await auth();
  if (!testEmail && !session?.user) redirect("/login");

  const usage: DashboardUsage = await getDashboardUsage(
    {
      email: testEmail ?? session?.user?.email,
      username: session?.user?.name
    },
    { fixturePath: process.env.GITFUSE_DASHBOARD_USAGE_FIXTURE }
  );
  const nextExpiryDays = daysUntil(usage.nextExpiryAt);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Plan usage</p>
          <h1>Usage</h1>
        </div>
        <p>{usage.tier} tier</p>
      </header>

      <section className="repo-summary" aria-label="Usage summary">
        <div>
          <span>Repositories</span>
          <strong>
            {usage.repos.current} / {formatLimit(usage.repos.max)}
          </strong>
        </div>
        <div>
          <span>Devices</span>
          <strong>
            {usage.devices.current} / {formatLimit(usage.devices.max)}
          </strong>
        </div>
        <div>
          <span>Storage</span>
          <strong>{formatBytes(usage.storage.currentBytes)}</strong>
        </div>
        <div>
          <span>History</span>
          <strong>{usage.historyDays} days</strong>
        </div>
      </section>

      <section className="usage-layout" aria-label="Usage limits">
        <div className="usage-panel">
          <h2>Current limits</h2>
          <UsageMeter
            label="Repository slots"
            current={String(usage.repos.current)}
            max={formatLimit(usage.repos.max)}
            percent={percent(usage.repos.current, usage.repos.max)}
          />
          <UsageMeter
            label="Active devices"
            current={String(usage.devices.current)}
            max={formatLimit(usage.devices.max)}
            percent={percent(usage.devices.current, usage.devices.max)}
          />
          <UsageMeter
            label="Storage total"
            current={formatBytes(usage.storage.currentBytes)}
            max={formatBytes(usage.storage.maxBytes)}
            percent={percent(usage.storage.currentBytes, usage.storage.maxBytes)}
          />
        </div>

        <div className="usage-panel">
          <h2>History timeline</h2>
          <dl className="usage-facts">
            <div>
              <dt>Retention window</dt>
              <dd>{usage.historyDays} days</dd>
            </div>
            <div>
              <dt>Active bundles</dt>
              <dd>{usage.activeBundleCount}</dd>
            </div>
            <div>
              <dt>Next expiry</dt>
              <dd>{formatDate(usage.nextExpiryAt)}</dd>
            </div>
            <div>
              <dt>Days remaining</dt>
              <dd>{nextExpiryDays === null ? "-" : nextExpiryDays}</dd>
            </div>
            <div>
              <dt>Bundle size limit</dt>
              <dd>{formatBytes(usage.bundleSize.maxBytes)} per sync</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
