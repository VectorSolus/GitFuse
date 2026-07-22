import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { DashboardDevice } from "./devices";

export type UsageMetricId =
  | "repositories"
  | "devices"
  | "storage"
  | "history"
  | "bundle";

export type UsageDetailRow = {
  id: string;
  name: string;
  meta: string;
  value?: string;
};

export type UsageMetric = {
  id: UsageMetricId;
  label: string;
  value: number;
  limit: number | "unlimited";
  displayValue?: string;
  displayLimit?: string;
  isUnlimited?: boolean;
  unit: string;
  helper: string;
  detail: string;
  tone: "ocean" | "green" | "violet" | "amber" | "blue";
  rowsTitle: string;
  emptyText: string;
  rows: UsageDetailRow[];
};

export function buildUsageMetrics(data: DashboardData | null): UsageMetric[] {
  const usage = data?.usage;
  const repos = data?.repositories ?? [];
  const devices = data ? getActiveUsageDevices(data.devices) : [];
  const history = data?.history ?? [];
  const deviceCurrent = data ? devices.length : usage?.devices.current ?? 0;
  const repoLimit = normalizeLimit(usage?.repos.max, 5);
  const deviceLimit = normalizeLimit(usage?.devices.max, 2);
  const storageLimitBytes = toFiniteNumber(
    usage?.storage.maxBytes,
    500 * 1024 * 1024,
  );
  const storageCurrentBytes = toFiniteNumber(usage?.storage.currentBytes, 0);
  const bundleLimitBytes = toFiniteNumber(
    usage?.bundleSize.maxBytes,
    50 * 1024 * 1024,
  );
  const largestBundleBytes = toFiniteNumber(
    usage?.bundleSize.largestRecentBundleBytes,
    0,
  );
  const historyUsedDays =
    usage?.historyRetention?.usedDays ?? distinctHistoryDays(history);
  const historyLimitDays =
    usage?.historyRetention?.maxDays ?? usage?.historyDays ?? 30;

  return [
    {
      id: "repositories",
      label: "Repositories",
      value: toFiniteNumber(usage?.repos.current, 0),
      limit: repoLimit,
      displayLimit: formatCompactLimit(repoLimit),
      isUnlimited: repoLimit === "unlimited",
      unit: "repos",
      helper:
        repoLimit === "unlimited"
          ? "unlimited tracked repositories"
          : "tracked repositories",
      detail:
        "Repositories show the Git workspaces currently tracked by GitFuse. The count includes repositories that have been added through the CLI and are ready for private sync.",
      tone: "ocean",
      rowsTitle: "Synced repositories",
      emptyText: "No repositories have been synced yet.",
      rows: repos.map((repo) => ({
        id: repo.id,
        name: repo.displayName,
        meta: repo.relayEntryId,
        value: `${repo.activeBundleCount} bundles`,
      })),
    },
    {
      id: "devices",
      label: "Devices",
      value: deviceCurrent,
      limit: deviceLimit,
      displayLimit: formatCompactLimit(deviceLimit),
      isUnlimited: deviceLimit === "unlimited",
      unit: "devices",
      helper:
        deviceLimit === "unlimited"
          ? "unlimited trusted machines"
          : "trusted machines",
      detail:
        "Devices are trusted machines linked to your GitFuse account. Each device can push or pull private commit bundles after authentication.",
      tone: "green",
      rowsTitle: "Active devices",
      emptyText: "No active devices are linked yet.",
      rows: devices.map((device) => ({
        id: device.id,
        name: device.name,
        meta: device.lastActiveAt
          ? `Last active ${formatDate(device.lastActiveAt)}`
          : "No activity recorded",
        value: "active",
      })),
    },
    {
      id: "storage",
      label: "Storage",
      value: storageCurrentBytes,
      limit: storageLimitBytes,
      displayValue: formatBytes(storageCurrentBytes),
      displayLimit: formatBytes(storageLimitBytes),
      unit: "relay bytes",
      helper: "private relay storage",
      detail:
        "Storage is used by encrypted commit bundles waiting in the private relay. Cleaning old bundles or upgrading the plan can increase available space later.",
      tone: "violet",
      rowsTitle: "Storage breakdown",
      emptyText: "No storage has been used yet.",
      rows: repos
        .filter((repo) => repo.activeStorageBytes > 0)
        .map((repo) => ({
          id: repo.id,
          name: repo.displayName,
          meta: "Encrypted relay payloads",
          value: formatBytes(repo.activeStorageBytes),
        })),
    },
    {
      id: "history",
      label: "History retention",
      value: toFiniteNumber(historyUsedDays, 0),
      limit: toFiniteNumber(historyLimitDays, 0),
      unit: "days",
      helper: "activity days retained",
      detail:
        "History retention shows actual calendar days with retained sync activity against the current plan window.",
      tone: "amber",
      rowsTitle: "History coverage",
      emptyText: "No sync history is available yet.",
      rows: history.map((event) => ({
        id: event.id,
        name: event.repositoryName,
        meta: `${event.eventType} by ${event.deviceName}`,
        value: formatDate(event.createdAt),
      })),
    },
    {
      id: "bundle",
      label: "Bundle size limit",
      value: largestBundleBytes,
      limit: bundleLimitBytes,
      displayValue: formatBytes(largestBundleBytes),
      displayLimit: formatBytes(bundleLimitBytes),
      unit: "largest sync",
      helper: "actual largest recent bundle",
      detail:
        "Bundle size compares the largest actual encrypted sync payload with the current plan's per-sync allowance.",
      tone: "blue",
      rowsTitle: "Recent bundle sizes",
      emptyText: "No bundles have been created yet.",
      rows: (usage?.recentBundles ?? []).map((bundle) => ({
        id: `${bundle.repositoryName}-${bundle.syncedAt}-${bundle.sizeBytes}`,
        name: bundle.repositoryName,
        meta: `${bundle.deviceName ?? "Unknown device"} - ${formatDate(bundle.syncedAt)}`,
        value: formatBytes(bundle.sizeBytes),
      })),
    },
  ];
}

export function getActiveUsageDevices(devices: DashboardDevice[]) {
  return devices.filter(isActiveUsageDevice);
}

export function isActiveUsageDevice(
  device: Pick<DashboardDevice, "revokedAt" | "status">,
) {
  return device.revokedAt == null && device.status !== "revoked";
}

export function getUsageMetricPercent(
  metric: Pick<UsageMetric, "value" | "limit">,
) {
  return getPercent(metric.value, metric.limit);
}

export function getPercent(value: number, limit: number | "unlimited") {
  if (limit === "unlimited") return 0;

  const current = toFiniteNumber(value, 0);
  const max = toFiniteNumber(limit, 0);
  if (max <= 0) return 0;
  return clampPercent((current / max) * 100);
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function formatPercent(value: number) {
  const percent = clampPercent(value);
  if (percent === 0) return "0%";
  if (percent < 0.01) return "<0.01%";
  if (percent < 1) {
    return `${percent.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
  }

  return `${Math.round(percent)}%`;
}

export function formatBytes(bytes: number) {
  const safeBytes = toFiniteNumber(bytes, 0);
  if (safeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "Unlimited" : String(value);
}

export function formatCompactLimit(value: number | "unlimited") {
  return value === "unlimited" ? "∞" : String(value);
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";

  return date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeLimit(
  value: number | "unlimited" | null | undefined,
  fallback: number,
) {
  if (value === "unlimited") {
    return "unlimited";
  }

  return Math.max(0, toFiniteNumber(value, fallback));
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function distinctHistoryDays(history: DashboardData["history"]) {
  return new Set(
    history
      .map((event) => formatDateKey(new Date(event.createdAt)))
      .filter((key): key is string => key != null),
  ).size;
}

function formatDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
