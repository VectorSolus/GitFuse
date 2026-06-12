"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";

const setupSteps = [
  {
    title: "Install GitFuse CLI",
    command: "brew install gitfuse",
  },
  {
    title: "Authenticate this machine",
    command: "gitfuse auth",
  },
  {
    title: "Verify device trust",
    command: "gitfuse devices",
  },
];

const securityItems = [
  {
    label: "Device-scoped access",
    value: "Enabled",
    helper: "Each machine receives an independent trust record.",
  },
  {
    label: "Relay key encryption",
    value: "Ready",
    helper: "Commit bundles remain private during transfer.",
  },
  {
    label: "Session revocation",
    value: "Available soon",
    helper: "Revoke access from the dashboard in upcoming releases.",
  },
];

export default function DevicesPage() {
  const { data } = useDashboardData();
  const devices = data?.devices ?? [];
  const trustedDevices = devices.filter((device) => device.status === "active");
  const activeDeviceCount = trustedDevices.filter((device) => device.lastActiveAt).length;

  const deviceMetrics = [
    {
      label: "Trusted devices",
      value: `${trustedDevices.length} / ${formatLimit(data?.usage.devices.max ?? 3)}`,
      helper: "machines linked to this workspace",
      tone: "ocean",
    },
    {
      label: "Active sessions",
      value: String(activeDeviceCount),
      helper: "currently authenticated clients",
      tone: "green",
    },
    {
      label: "Pending approvals",
      value: "0",
      helper: "device requests waiting for approval",
      tone: "violet",
    },
  ];

  return (
    <div className="gf-devices-page">
      <section className="gf-devices-hero">
        <div>
          <p className="gf-dash-eyebrow">Devices</p>
          <h2>Manage the machines trusted to sync your commits.</h2>
          <span>
            Link laptops, desktops, and workstations to your GitFuse workspace.
            Each device gets its own private sync identity.
          </span>
        </div>

        <div className="gf-devices-hero-actions">
          <button type="button" className="gf-dash-primary-action">
            Link device
          </button>
          <a href="/docs" className="gf-dash-secondary-action">
            View docs
          </a>
        </div>
      </section>

      <section className="gf-devices-metrics">
        {deviceMetrics.map((metric) => (
          <article
            key={metric.label}
            className={`gf-device-metric-card gf-device-metric-${metric.tone}`}
          >
            <p>{metric.label}</p>
            <h3>{metric.value}</h3>
            <span>{metric.helper}</span>
          </article>
        ))}
      </section>

      <section className="gf-devices-grid">
        <article className="gf-devices-panel gf-devices-list-panel">
          <div className="gf-devices-panel-header">
            <div>
              <p className="gf-dash-eyebrow">Device list</p>
              <h3>Trusted machines</h3>
            </div>

            <span className="gf-devices-status-pill">
              {devices.length > 0 ? "Connected" : "Empty"}
            </span>
          </div>

          <div className="gf-devices-toolbar">
            <label className="gf-devices-search">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20l-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>

              <input type="search" placeholder="Search devices..." />
            </label>

            <select aria-label="Device status filter">
              <option>All devices</option>
              <option>Trusted</option>
              <option>Pending</option>
              <option>Revoked</option>
            </select>
          </div>

          {devices.length > 0 ? (
            <div className="gf-devices-command-list">
              {devices.map((device) => (
                <div key={device.id}>
                  <span>{device.name}</span>
                  <code>
                    {device.status} ·{" "}
                    {device.lastActiveAt
                      ? `last active ${formatDate(device.lastActiveAt)}`
                      : "not active yet"}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <div className="gf-devices-empty">
              <div className="gf-devices-empty-icon">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="30"
                  height="30"
                  fill="none"
                >
                  <rect
                    x="3"
                    y="4"
                    width="13"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <rect
                    x="17"
                    y="8"
                    width="4"
                    height="12"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M7 20h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10 14v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h4>No devices linked yet</h4>
              <p>
                Run <code>gitfuse auth</code> on a machine to create its trusted
                device identity and connect it to this workspace.
              </p>

              <div className="gf-devices-command-list">
                {setupSteps.map((step) => (
                  <div key={step.command}>
                    <span>{step.title}</span>
                    <code>{step.command}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="gf-devices-panel gf-devices-security-panel">
          <div className="gf-devices-panel-header">
            <div>
              <p className="gf-dash-eyebrow">Security</p>
              <h3>Device trust model</h3>
            </div>
          </div>

          <div className="gf-devices-security-list">
            {securityItems.map((item) => (
              <div key={item.label} className="gf-devices-security-item">
                <div>
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                </div>

                <span>{item.helper}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "unlimited" : String(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
