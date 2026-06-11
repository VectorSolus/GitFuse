const repoMetrics = [
  {
    label: "Total repositories",
    value: "0",
    helper: "tracked relay entries",
    tone: "ocean",
  },
  {
    label: "Synced",
    value: "0",
    helper: "repositories up to date",
    tone: "green",
  },
  {
    label: "Active bundles",
    value: "0",
    helper: "waiting in private relay",
    tone: "violet",
  },
];

const repoRows = [
  {
    command: "gitfuse add .",
    label: "Track a repository",
  },
  {
    command: "gitfuse sync",
    label: "Send private local commits",
  },
  {
    command: "gitfuse pull",
    label: "Resume work elsewhere",
  },
];

export default function RepositoriesPage() {
  return (
    <div className="gf-repos-page-v3">
      <section className="gf-repos-hero-v3">
        <div>
          <p className="gf-dash-eyebrow">Repositories</p>
          <h2>Track private sync across repositories.</h2>
          <span>
            Monitor GitFuse-enabled repositories, see sync status, and add your
            first workspace from the CLI when the backend connection is ready.
          </span>
        </div>

        <div className="gf-repos-hero-actions-v3">
          <button type="button" className="gf-dash-secondary-action">
            Add repository
          </button>
        </div>
      </section>

      <section className="gf-repos-metrics-v3">
        {repoMetrics.map((metric) => (
          <article
            key={metric.label}
            className={`gf-repo-metric-card-v3 gf-repo-metric-${metric.tone}`}
          >
            <p>{metric.label}</p>
            <h3>{metric.value}</h3>
            <span>{metric.helper}</span>
          </article>
        ))}
      </section>

      <section className="gf-repos-workspace-v3">
        <article className="gf-repos-panel-v3">
          <div className="gf-repos-panel-header-v3">
            <div>
              <p className="gf-dash-eyebrow">Repository list</p>
              <h3>Your tracked repositories</h3>
            </div>

            <span className="gf-repos-status-pill-v3">Empty</span>
          </div>

          <div className="gf-repos-toolbar-v3">
            <label className="gf-repos-search-v3">
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

              <input type="search" placeholder="Search repositories..." />
            </label>

            <select aria-label="Repository status filter">
              <option>All statuses</option>
              <option>Synced</option>
              <option>Pending</option>
              <option>Attention needed</option>
            </select>
          </div>

          <div className="gf-repos-empty-v3">
            <div className="gf-repos-empty-icon-v3">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="30"
                height="30"
                fill="none"
              >
                <path
                  d="M6 3v12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  cx="6"
                  cy="5"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle
                  cx="18"
                  cy="19"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M6 13c0 3 2 6 6 6h4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <h4>No repositories yet</h4>
            <p>
              Run <code>gitfuse add .</code> inside a repository and sync your
              first bundle to make it appear here.
            </p>

            <div className="gf-repos-command-list-v3">
              {repoRows.map((row) => (
                <div key={row.command}>
                  <span>{row.label}</span>
                  <code>{row.command}</code>
                </div>
              ))}
            </div>

            <a href="/docs">Open documentation</a>
          </div>
        </article>
      </section>
    </div>
  );
}