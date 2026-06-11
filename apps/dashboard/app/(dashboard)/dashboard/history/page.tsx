"use client";

import { useMemo, useState } from "react";

type CommitItem = {
  sha: string;
  message: string;
  author: string;
  time: string;
};

type RepoSyncItem = {
  repo: string;
  branch: string;
  direction: "sync" | "pull" | "drop" | "rebase-sync";
  commits: CommitItem[];
};

type SyncDay = {
  date: string;
  repositories: RepoSyncItem[];
};

type GraphDay = {
  date: string;
  label: string;
  count: number;
  level: number;
  data?: SyncDay;
};

const sampleSyncHistory: SyncDay[] = [
  {
    date: offsetDate(-2),
    repositories: [
      {
        repo: "gitfuse-dashboard",
        branch: "main",
        direction: "sync",
        commits: [
          {
            sha: "a8f31c2",
            message: "polish dashboard sidebar interaction",
            author: "Iacon",
            time: "10:24 AM",
          },
          {
            sha: "b6d91aa",
            message: "add repository workspace empty state",
            author: "Iacon",
            time: "10:31 AM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-5),
    repositories: [
      {
        repo: "gitfuse-cli",
        branch: "auth-flow",
        direction: "sync",
        commits: [
          {
            sha: "c1d48fe",
            message: "wire device auth command shell",
            author: "Iacon",
            time: "7:46 PM",
          },
        ],
      },
      {
        repo: "gitfuse-dashboard",
        branch: "main",
        direction: "pull",
        commits: [
          {
            sha: "e92f6b0",
            message: "resume homepage hero layout",
            author: "Iacon",
            time: "8:11 PM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-9),
    repositories: [
      {
        repo: "gitfuse-relay",
        branch: "dev",
        direction: "sync",
        commits: [
          {
            sha: "6a4d2c9",
            message: "prepare relay bundle metadata shape",
            author: "Iacon",
            time: "3:18 PM",
          },
          {
            sha: "75ac440",
            message: "add relay event placeholder types",
            author: "Iacon",
            time: "3:27 PM",
          },
          {
            sha: "1e9bf76",
            message: "document local relay handshake",
            author: "Iacon",
            time: "3:42 PM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-15),
    repositories: [
      {
        repo: "gitfuse-dashboard",
        branch: "docs",
        direction: "sync",
        commits: [
          {
            sha: "9f0c3b1",
            message: "build cli docs frontend page",
            author: "Iacon",
            time: "12:04 PM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-23),
    repositories: [
      {
        repo: "gitfuse-cli",
        branch: "main",
        direction: "rebase-sync",
        commits: [
          {
            sha: "3f8c12d",
            message: "clean command formatter output",
            author: "Iacon",
            time: "5:56 PM",
          },
          {
            sha: "49ab20a",
            message: "add local config discovery",
            author: "Iacon",
            time: "6:02 PM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-34),
    repositories: [
      {
        repo: "gitfuse-dashboard",
        branch: "auth-ui",
        direction: "sync",
        commits: [
          {
            sha: "d7a14f0",
            message: "create email first login flow",
            author: "Iacon",
            time: "9:34 AM",
          },
        ],
      },
    ],
  },
  {
    date: offsetDate(-42),
    repositories: [
      {
        repo: "gitfuse-dashboard",
        branch: "landing",
        direction: "sync",
        commits: [
          {
            sha: "0b6a9d5",
            message: "add aurora homepage background",
            author: "Iacon",
            time: "11:22 AM",
          },
          {
            sha: "ce8a302",
            message: "adjust hero headline spacing",
            author: "Iacon",
            time: "11:40 AM",
          },
        ],
      },
    ],
  },
];

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function HistoryPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const historyByDate = useMemo(() => {
    return new Map(sampleSyncHistory.map((day) => [day.date, day]));
  }, []);

  const graphDays = useMemo(
    () => buildGraphDays(historyByDate),
    [historyByDate],
  );

  const selectedDay = selectedDate ? historyByDate.get(selectedDate) : undefined;
  const selectedCommitCount = selectedDay ? countCommits(selectedDay) : 0;

  const totals = useMemo(() => {
    const syncedDays = sampleSyncHistory.length;

    const totalRepos = new Set(
      sampleSyncHistory.flatMap((day) =>
        day.repositories.map((repo) => repo.repo),
      ),
    ).size;

    const totalCommits = sampleSyncHistory.reduce((dayTotal, day) => {
      return (
        dayTotal +
        day.repositories.reduce(
          (repoTotal, repo) => repoTotal + repo.commits.length,
          0,
        )
      );
    }, 0);

    const totalBundles = sampleSyncHistory.reduce(
      (total, day) => total + day.repositories.length,
      0,
    );

    return {
      syncedDays,
      totalRepos,
      totalCommits,
      totalBundles,
    };
  }, []);

  return (
    <div className="gf-history-page">
      <section className="gf-history-hero">
        <div>
          <p className="gf-dash-eyebrow">History</p>
          <h2>Review every private sync event in one timeline.</h2>
          <span>
            Track when commits moved, which repositories were involved, and what
            changed during each relay-side sync operation.
          </span>
        </div>
      </section>

      <section className="gf-history-metrics">
        <article className="gf-history-metric gf-history-metric-ocean">
          <p>Total commits synced</p>
          <h3>{totals.totalCommits}</h3>
          <span>commit objects moved privately</span>
        </article>

        <article className="gf-history-metric gf-history-metric-green">
          <p>Synced days</p>
          <h3>{totals.syncedDays}</h3>
          <span>days with relay activity</span>
        </article>

        <article className="gf-history-metric gf-history-metric-violet">
          <p>Repositories</p>
          <h3>{totals.totalRepos}</h3>
          <span>workspaces with history</span>
        </article>

        <article className="gf-history-metric gf-history-metric-blue">
          <p>Bundles</p>
          <h3>{totals.totalBundles}</h3>
          <span>sync bundles recorded</span>
        </article>
      </section>

      <section className="gf-history-grid">
        <article className="gf-history-panel gf-history-graph-panel">
          <div className="gf-history-panel-header">
            <div>
              <p className="gf-dash-eyebrow">Sync graph</p>
              <h3>Relay activity</h3>
            </div>

            <span className="gf-history-pill">Last 52 weeks</span>
          </div>

          <div className="gf-history-graph-shell">
            <div className="gf-history-month-row">
              {buildMonthMarkers(graphDays).map((month) => (
                <span
                  key={`${month.label}-${month.column}`}
                  style={{ gridColumnStart: month.column }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <div className="gf-history-graph-body">
              <div className="gf-history-weekdays">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>

              <div className="gf-history-squares" aria-label="Sync history graph">
                {graphDays.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={`gf-history-square level-${day.level} ${
                      selectedDate === day.date ? "is-selected" : ""
                    }`}
                    aria-label={`${day.label}: ${day.count} synced commit${
                      day.count === 1 ? "" : "s"
                    }`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <span className="gf-history-tooltip">
                      <strong>{day.label}</strong>
                      <small>
                        {day.count === 0
                          ? "No commits synced"
                          : `${day.count} commit${
                              day.count === 1 ? "" : "s"
                            } synced`}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="gf-history-legend">
              <span>Less</span>
              <i className="level-0" />
              <i className="level-1" />
              <i className="level-2" />
              <i className="level-3" />
              <i className="level-4" />
              <span>More</span>
            </div>
          </div>
        </article>

        <aside className="gf-history-panel gf-history-detail-panel">
          <div className="gf-history-panel-header">
            <div>
              <p className="gf-dash-eyebrow">Selected day</p>
              <h3>
                {selectedDate ? formatReadableDate(selectedDate) : "Pick a square"}
              </h3>
            </div>

            <span className="gf-history-pill">
              {selectedDate
                ? selectedCommitCount === 0
                  ? "No commits"
                  : `${selectedCommitCount} commits`
                : "None"}
            </span>
          </div>

          {!selectedDate ? (
            <div className="gf-history-empty-details">
              <div className="gf-history-empty-icon">
                <HistoryIcon />
              </div>

              <h4>Click a square to inspect sync details</h4>
              <p>
                Days with activity show repositories, operation type, commit
                SHAs, commit messages, author, and sync time.
              </p>
            </div>
          ) : selectedDay ? (
            <div className="gf-history-day-details">
              {selectedDay.repositories.map((repo) => (
                <article
                  key={`${selectedDay.date}-${repo.repo}-${repo.branch}`}
                  className="gf-history-repo-card"
                >
                  <div className="gf-history-repo-head">
                    <div>
                      <h4>{repo.repo}</h4>
                      <p>
                        {repo.branch} · {repo.direction}
                      </p>
                    </div>

                    <span>{repo.commits.length}</span>
                  </div>

                  <div className="gf-history-commit-list">
                    {repo.commits.map((commit) => (
                      <div key={commit.sha} className="gf-history-commit-row">
                        <code>{commit.sha}</code>

                        <div>
                          <strong>{commit.message}</strong>
                          <p>
                            {commit.author} · {commit.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="gf-history-empty-details">
              <div className="gf-history-empty-icon">
                <HistoryIcon />
              </div>

              <h4>No commits synced on this day</h4>
              <p>
                {formatReadableDate(selectedDate)} has no relay-side sync
                activity yet. Pick a highlighted square to inspect synced
                repositories and commit details.
              </p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
    >
      <path
        d="M3 12a9 9 0 1 0 3-6.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 4v5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildGraphDays(historyByDate: Map<string, SyncDay>): GraphDay[] {
  const today = startOfDay(new Date());
  const end = startOfWeek(today);
  const start = addDays(end, -7 * 52 + 1);

  const days: GraphDay[] = [];

  for (let index = 0; index < 7 * 52; index += 1) {
    const date = addDays(start, index);
    const dateKey = formatDateKey(date);
    const dayData = historyByDate.get(dateKey);
    const count = dayData ? countCommits(dayData) : 0;

    days.push({
      date: dateKey,
      label: formatReadableDate(dateKey),
      count,
      level: getActivityLevel(count),
      data: dayData,
    });
  }

  return days;
}

function buildMonthMarkers(days: GraphDay[]) {
  const markers: { label: string; column: number }[] = [];
  let lastMonth = "";

  days.forEach((day, index) => {
    const date = parseDateKey(day.date);
    const month = monthLabels[date.getMonth()];
    const column = Math.floor(index / 7) + 1;

    if (date.getDate() <= 7 && month !== lastMonth) {
      markers.push({
        label: month,
        column,
      });

      lastMonth = month;
    }
  });

  return markers;
}

function getActivityLevel(count: number) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

function countCommits(day: SyncDay) {
  return day.repositories.reduce(
    (total, repo) => total + repo.commits.length,
    0,
  );
}

function offsetDate(days: number) {
  return formatDateKey(addDays(startOfDay(new Date()), days));
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - diff);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatReadableDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}