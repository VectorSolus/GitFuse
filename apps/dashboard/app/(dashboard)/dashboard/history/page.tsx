"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DashboardDataError } from "@/components/dashboard/data-error";
import { HistoryGridClient } from "@/components/dashboard/history-grid-client";
import { useDashboardData, type DashboardData } from "@/hooks/use-dashboard-data";
import {
  buildHistoryActivityByDate,
  buildYearCalendar,
  formatHistoryDateLabel,
  rememberSelectedHistoryDate,
  resolveSelectedHistoryDate,
  summarizeHistoryEvents,
  toLocalDateKey,
  type HistoryDateSelectionsByYear,
} from "@/lib/history-calendar";

type CommitItem = {
  sha: string;
  message: string;
  author: string | null;
  time: string;
};

type RepoSyncItem = {
  id: string;
  repo: string;
  branch: string;
  device: string;
  syncedAt: string;
  bundleSizeBytes: number;
  direction: "sync" | "pull" | "drop" | "undo" | "rebase-sync";
  commitCount: number;
  commits: CommitItem[];
};

type SyncDay = {
  date: string;
  repositories: RepoSyncItem[];
};

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [browserToday, setBrowserToday] = useState<Date | null>(null);
  const currentYear = browserToday?.getFullYear() ?? new Date().getFullYear();
  const queryYear = Number(searchParams.get("year"));
  const requestedYear =
    Number.isInteger(queryYear) && queryYear >= 1970 && queryYear <= currentYear
      ? queryYear
      : currentYear;
  const { data, loading, error } = useDashboardData(requestedYear);
  const [explicitSelectionsByYear, setExplicitSelectionsByYear] = useState<
    HistoryDateSelectionsByYear
  >({});
  const selectedYear = data?.selectedHistoryYear ?? currentYear;
  const syncHistory = useMemo(() => buildSyncHistory(data?.history ?? []), [data?.history]);

  const historyByDate = useMemo(() => {
    return new Map(syncHistory.map((day) => [day.date, day]));
  }, [syncHistory]);

  const calendar = useMemo(
    () => buildYearCalendar(selectedYear),
    [selectedYear],
  );
  const activityByDate = useMemo(
    () =>
      buildHistoryActivityByDate(
        data?.history ?? [],
        (event) => event.createdAt,
        (event) => event.commitCount,
      ),
    [data?.history],
  );

  const resolvedSelectedDate = useMemo(
    () => {
      if (!browserToday) return null;
      return resolveSelectedHistoryDate(
        [...activityByDate.values()]
          .filter((activity) => activity.commitCount > 0)
          .map((activity) => activity.dateKey),
        selectedYear,
        explicitSelectionsByYear,
        browserToday,
      );
    },
    [activityByDate, browserToday, explicitSelectionsByYear, selectedYear],
  );
  const activeSelectedDate = resolvedSelectedDate;
  const selectedDay = activeSelectedDate
    ? historyByDate.get(activeSelectedDate)
    : undefined;
  const selectedCommitCount = selectedDay ? countCommits(selectedDay) : 0;

  useEffect(() => {
    setBrowserToday(new Date());
  }, []);

  useEffect(() => {
    if (!data || data.selectedHistoryYear === requestedYear) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(data.selectedHistoryYear));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [data, pathname, requestedYear, router, searchParams]);

  function selectYear(year: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectDate(dateKey: string) {
    setExplicitSelectionsByYear((current) =>
      rememberSelectedHistoryDate(current, selectedYear, dateKey),
    );
  }

  const totals = useMemo(() => {
    return summarizeHistoryEvents(
      data?.history ?? [],
      (event) => event.createdAt,
      (event) => event.commitCount,
      (event) => event.repositoryName,
    );
  }, [data?.history]);

  if (error && !loading) {
    return <DashboardDataError message={error} />;
  }

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

            <label className="gf-history-year-select">
              <span className="sr-only">Select history year</span>
              <select
                value={selectedYear}
                onChange={(event) => selectYear(Number(event.target.value))}
                disabled={loading}
              >
                {(data?.historyYears ?? [currentYear]).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <HistoryGridClient
            calendar={calendar}
            activityByDate={activityByDate}
            selectedDateKey={activeSelectedDate}
            onSelectDate={selectDate}
            loading={loading}
          />
        </article>

        <aside className="gf-history-panel gf-history-detail-panel">
          <div className="gf-history-panel-header">
            <div>
              <p className="gf-dash-eyebrow">Selected day</p>
              <h3>
                {activeSelectedDate
                  ? formatHistoryDateLabel(activeSelectedDate)
                  : "Select a day"}
              </h3>
            </div>

            <span className="gf-history-pill">
              {activeSelectedDate
                ? selectedCommitCount === 0
                  ? "No commits"
                  : `${selectedCommitCount} commits`
                : "None"}
            </span>
          </div>

          {selectedDay ? (
            <div className="gf-history-day-details">
              {selectedDay.repositories.map((repo) => (
                <article
                  key={`${selectedDay.date}-${repo.id}`}
                  className="gf-history-repo-card"
                >
                  <div className="gf-history-repo-head">
                    <div>
                      <h4>{repo.repo}</h4>
                      <p>
                        {repo.branch} · {repo.direction} · {repo.device} ·{" "}
                        {formatTime(repo.syncedAt)} · {formatBytes(repo.bundleSizeBytes)}
                      </p>
                    </div>

                    <span>{repo.commitCount}</span>
                  </div>

                  <div className="gf-history-commit-list">
                    {repo.commits.length > 0 ? (
                      repo.commits.map((commit) => (
                        <div key={commit.sha} className="gf-history-commit-row">
                          <code>{commit.sha}</code>

                          <div>
                            <strong>{commit.message}</strong>
                            <p>
                              {commit.author ?? "Unknown author"} · {commit.time}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="gf-history-commit-row">
                        <code>{repo.commitCount}</code>
                        <div>
                          <strong>
                            {repo.commitCount} commit{repo.commitCount === 1 ? "" : "s"} synced
                          </strong>
                          <p>Commit details were not recorded for this older sync.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="gf-history-empty-details">
              <div className="gf-history-empty-icon">
                <HistoryIcon />
              </div>

              {activeSelectedDate ? (
                <>
                  <h4>
                    No activity on {formatHistoryDateLabel(activeSelectedDate)}.
                  </h4>
                  <p>Select a highlighted day to view synced commits.</p>
                </>
              ) : (
                <>
                  <h4>Select a day to view synced commits.</h4>
                  <p>Highlighted days contain relay-side sync activity.</p>
                </>
              )}
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

function countCommits(day: SyncDay) {
  return day.repositories.reduce(
    (total, repo) => total + repo.commitCount,
    0,
  );
}

function buildSyncHistory(events: DashboardData["history"]) {
  const days = new Map<string, SyncDay>();

  events.forEach((event) => {
    const date = toLocalDateKey(new Date(event.createdAt));
    const day = days.get(date) ?? { date, repositories: [] };

    day.repositories.push({
      id: event.id,
      repo: event.repositoryName,
      branch: event.relayEntryId,
      device: event.deviceName,
      syncedAt: event.createdAt,
      bundleSizeBytes: event.bundleSizeBytes,
      direction: event.eventType,
      commitCount: event.commitCount,
      commits: event.commits.map((commit) => ({
        sha: shortSHA(commit.sha),
        message: commit.message,
        author: commit.authorName,
        time: formatTime(commit.committedAt ?? commit.authoredAt ?? event.createdAt),
      })),
    });

    days.set(date, day);
  });

  return Array.from(days.values());
}

function shortSHA(sha: string) {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
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
