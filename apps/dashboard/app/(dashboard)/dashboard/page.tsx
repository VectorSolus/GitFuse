"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import { DashboardDataError } from "@/components/dashboard/data-error";
import { useDashboardData } from "@/hooks/use-dashboard-data";

const SoftAurora = dynamic(() => import("@/components/effects/SoftAurora"), {
  ssr: false,
}) as ComponentType<any>;

export default function DashboardOverviewPage() {
  const { data, error, loading } = useDashboardData();
  const usage = data?.usage;
  const billing = data?.billing;
  const activeDevices = data?.devices.filter((device) => device.status === "active") ?? [];
  const latestDevice = activeDevices[0];
  const latestEvent = data?.history[0];

  const metrics = [
    {
      label: "Repositories",
      value: `${usage?.repos.current ?? 0} / ${formatLimit(usage?.repos.max ?? 5)}`,
      helper: `${billing?.tier ?? "free"} tier tracked repositories`,
    },
    {
      label: "Devices",
      value: `${usage?.devices.current ?? 0} / ${formatLimit(usage?.devices.max ?? 2)}`,
      helper: "trusted machines connected",
    },
    {
      label: "Storage",
      value: formatBytes(usage?.storage.currentBytes ?? 0),
      helper: `of ${formatBytes(usage?.storage.maxBytes ?? 500 * 1024 * 1024)} included`,
    },
    {
      label: "Sync events",
      value: String(data?.history.length ?? 0),
      helper: "relay-side events",
    },
  ];

  const activity = [
    {
      title: "Relay status",
      value: latestEvent ? "Active" : "Idle",
      helper: latestEvent
        ? `${latestEvent.eventType} recorded for ${latestEvent.repositoryName}.`
        : "No sync bundles received yet.",
    },
    {
      title: "Current plan",
      value: titleCase(billing?.tier ?? "free"),
      helper: `${formatLimit(usage?.repos.max ?? 5)} repositories · ${formatLimit(
        usage?.devices.max ?? 2,
      )} devices · ${formatBytes(usage?.storage.maxBytes ?? 500 * 1024 * 1024)} storage.`,
    },
    {
      title: "Last device",
      value: latestDevice?.name ?? "Not linked",
      helper: latestDevice?.lastActiveAt
        ? `Last active ${formatDate(latestDevice.lastActiveAt)}.`
        : "Run gitfuse auth login from your machine.",
    },
  ];

  if (error && !loading) {
    return <DashboardDataError message={error} />;
  }

  return (
    <div className="gf-dash-overview-v2">
      <div className="gf-dash-aurora-layer" aria-hidden="true">
        <SoftAurora
          speed={0.35}
          scale={1.35}
          brightness={0.55}
          color1="#0890f2"
          color2="#1f54dc"
          noiseFrequency={2.2}
          noiseAmplitude={0.65}
          bandHeight={0.35}
          bandSpread={0.7}
          octaveDecay={0.12}
          layerOffset={0.2}
          colorSpeed={0.55}
          enableMouseInteraction
          mouseInfluence={0.12}
        />
      </div>

      <section className="gf-dash-overview-grid">
        <div className="gf-dash-overview-left">
          <article className="gf-dash-welcome-card">
            <div className="gf-dash-card-glow" />

            <p className="gf-dash-eyebrow">Overview</p>

            <h2>Your private sync workspace is ready.</h2>

            <p>
              Connect your first device and repository to start moving local Git
              commits across machines without publishing unfinished work.
            </p>

            <div className="gf-dash-welcome-actions">
              <a href="/docs" className="gf-dash-primary-action">
                View CLI docs
              </a>

              <a href="/dashboard/repos" className="gf-dash-secondary-action">
                Add repository
              </a>
            </div>
          </article>

          <section className="gf-dash-metrics-grid-v2">
            {metrics.map((metric) => (
              <article key={metric.label} className="gf-dash-metric-card-v2">
                <p>{metric.label}</p>
                <h3>{metric.value}</h3>
                <span>{metric.helper}</span>
              </article>
            ))}
          </section>

          <article className="gf-dash-code-panel">
            <div className="gf-dash-panel-heading">
              <div>
                <p className="gf-dash-eyebrow">Quick start</p>
                <h3>Set up GitFuse from your terminal.</h3>
              </div>

              <span>zsh</span>
            </div>

            <pre>
              <code>
                <span className="gf-code-comment"># 1. Install the GitFuse CLI</span>
                <span>brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git</span>
                <span>brew install VectorSolus/gitfuse/gitfuse</span>
                <span />
                <span className="gf-code-comment"># 2. Link this device to your workspace</span>
                <span>gitfuse auth login</span>
                <span />
                <span className="gf-code-comment"># 3. Track the current repository</span>
                <span>gitfuse add .</span>
                <span />
                <span className="gf-code-comment"># 4. Sync local commits to the private relay</span>
                <span>gitfuse sync</span>
              </code>
            </pre>
          </article>
        </div>

        <aside className="gf-dash-overview-right">
          <article className="gf-dash-side-panel">
            <div className="gf-dash-panel-heading">
              <div>
                <p className="gf-dash-eyebrow">Recent activity</p>
                <h3>No sync activity yet</h3>
              </div>

              <span>Idle</span>
            </div>

            <div className="gf-dash-empty-compact">
              <div className="gf-dash-empty-icon">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                >
                  <path
                    d="M4 13h3l2-6 4 12 2-6h5"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h4>Run your first sync</h4>

              <p>
                After running <code>gitfuse sync</code>, relay events and bundle
                history will appear here.
              </p>
            </div>
          </article>

          <article className="gf-dash-side-panel">
            <div className="gf-dash-panel-heading">
              <div>
                <p className="gf-dash-eyebrow">Workspace health</p>
                <h3>Ready for setup</h3>
              </div>
            </div>

            <div className="gf-dash-health-list">
              {activity.map((item) => (
                <div key={item.title} className="gf-dash-health-item">
                  <div>
                    <p>{item.title}</p>
                    <strong>{item.value}</strong>
                  </div>

                  <span>{item.helper}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="gf-dash-side-panel gf-dash-tip-panel">
            <p className="gf-dash-eyebrow">Tip</p>

            <h3>Keep WIP commits private.</h3>

            <p>
              GitFuse is designed for temporary local progress. Use it to move
              work between devices before you are ready to push to GitHub.
            </p>
          </article>
        </aside>
      </section>
    </div>
  );
}

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "∞" : String(value);
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

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
