import { redirect } from "next/navigation";

import { auth } from "../../../../lib/auth";
import { type DashboardSyncEvent, listDashboardSyncHistory } from "../../../../lib/history";

const eventLabels: Record<DashboardSyncEvent["eventType"], string> = {
  sync: "Sync",
  pull: "Pull",
  drop: "Drop",
  undo: "Undo",
  "rebase-sync": "Rebase sync"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

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

function HistoryTimeline({ events }: { events: DashboardSyncEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="repo-empty" aria-label="No sync history">
        <h2>No sync events yet</h2>
        <p>Run gitfuse sync, pull, drop, undo, or rebase-sync to create relay-side history.</p>
      </section>
    );
  }

  return (
    <ol className="history-timeline" aria-label="Sync event timeline">
      {events.map((event) => (
        <li key={event.id}>
          <div className={`history-marker history-marker-${event.eventType.replace("-", "")}`} aria-hidden="true" />
          <article className="history-event">
            <header>
              <div>
                <span className="history-event-type">{eventLabels[event.eventType]}</span>
                <h2>{event.repositoryName}</h2>
              </div>
              <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
            </header>
            <dl>
              <div>
                <dt>Device</dt>
                <dd>{event.deviceName}</dd>
              </div>
              <div>
                <dt>Commits</dt>
                <dd>{event.commitCount}</dd>
              </div>
              <div>
                <dt>Bundle</dt>
                <dd>{formatBytes(event.bundleSizeBytes)}</dd>
              </div>
              <div>
                <dt>Relay entry</dt>
                <dd>
                  <code>{event.relayEntryId}</code>
                </dd>
              </div>
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}

export default async function HistoryPage() {
  const testEmail = process.env.NODE_ENV !== "production" ? process.env.GITFUSE_TEST_DASHBOARD_EMAIL : undefined;
  const session = testEmail ? null : await auth();
  if (!testEmail && !session?.user) redirect("/login");

  const events = await listDashboardSyncHistory(
    {
      email: testEmail ?? session?.user?.email,
      username: session?.user?.name
    },
    { fixturePath: process.env.GITFUSE_DASHBOARD_HISTORY_FIXTURE }
  );

  const commitCount = events.reduce((total, event) => total + event.commitCount, 0);
  const storageBytes = events.reduce((total, event) => total + event.bundleSizeBytes, 0);
  const latestEvent = events[0]?.createdAt ?? null;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Relay-side audit trail</p>
          <h1>History</h1>
        </div>
        <p>{events.length} events</p>
      </header>

      <section className="repo-summary" aria-label="Sync history summary">
        <div>
          <span>Total events</span>
          <strong>{events.length}</strong>
        </div>
        <div>
          <span>Commits moved</span>
          <strong>{commitCount}</strong>
        </div>
        <div>
          <span>Bundle volume</span>
          <strong>{formatBytes(storageBytes)}</strong>
        </div>
        <div>
          <span>Latest event</span>
          <strong>{latestEvent ? formatDate(latestEvent) : "-"}</strong>
        </div>
      </section>

      <HistoryTimeline events={events} />
    </main>
  );
}
