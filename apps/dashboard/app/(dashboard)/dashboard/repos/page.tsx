import { redirect } from "next/navigation";

import { auth } from "../../../../lib/auth";
import { type DashboardRepository, listDashboardRepositories } from "../../../../lib/repositories";

function formatDate(value: string | null) {
  if (!value) return "Not synced yet";
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

function shortSha(rootSha: string) {
  return rootSha.length > 12 ? rootSha.slice(0, 12) : rootSha;
}

function RepositoryTable({ repositories }: { repositories: DashboardRepository[] }) {
  if (repositories.length === 0) {
    return (
      <section className="repo-empty" aria-label="No repositories">
        <h2>No relay entries yet</h2>
        <p>Run gitfuse add . and gitfuse sync from a committed repository to create the first relay entry.</p>
      </section>
    );
  }

  return (
    <div className="repo-table-wrap">
      <table className="repo-table">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Relay entry</th>
            <th>Sync state</th>
            <th>Bundles</th>
            <th>Storage</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {repositories.map((repository) => (
            <tr key={repository.id}>
              <td>
                <strong>{repository.displayName}</strong>
                <span>{repository.remoteUrl ?? "No git remote configured"}</span>
                <code>{shortSha(repository.rootSha)}</code>
              </td>
              <td>
                <code>{repository.relayEntryId}</code>
              </td>
              <td>
                <span className={`repo-state repo-state-${repository.syncState}`}>{repository.syncState}</span>
                <small>{repository.latestEventType ?? "no events"}</small>
              </td>
              <td>{repository.activeBundleCount}</td>
              <td>{formatBytes(repository.activeStorageBytes)}</td>
              <td>{formatDate(repository.latestEventAt ?? repository.lastSyncedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RepositoriesPage() {
  const testEmail = process.env.NODE_ENV !== "production" ? process.env.GITFUSE_TEST_DASHBOARD_EMAIL : undefined;
  const session = testEmail ? null : await auth();
  if (!testEmail && !session?.user) redirect("/login");

  const repositories = await listDashboardRepositories(
    {
      email: testEmail ?? session?.user?.email,
      username: session?.user?.name
    },
    { fixturePath: process.env.GITFUSE_DASHBOARD_REPOS_FIXTURE }
  );

  const syncedCount = repositories.filter((repository) => repository.syncState === "synced").length;
  const activeBundleCount = repositories.reduce((total, repository) => total + repository.activeBundleCount, 0);
  const activeStorageBytes = repositories.reduce((total, repository) => total + repository.activeStorageBytes, 0);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Relay entries</p>
          <h1>Repositories</h1>
        </div>
        <p>{repositories.length} tracked</p>
      </header>

      <section className="repo-summary" aria-label="Repository sync summary">
        <div>
          <span>Total repos</span>
          <strong>{repositories.length}</strong>
        </div>
        <div>
          <span>Synced</span>
          <strong>{syncedCount}</strong>
        </div>
        <div>
          <span>Active bundles</span>
          <strong>{activeBundleCount}</strong>
        </div>
        <div>
          <span>Storage</span>
          <strong>{formatBytes(activeStorageBytes)}</strong>
        </div>
      </section>

      <RepositoryTable repositories={repositories} />
    </main>
  );
}
