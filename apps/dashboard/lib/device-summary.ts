import type { DashboardDevice } from "./devices";

export type DashboardDeviceDisplayStatus = "active" | "inactive" | "revoked";

export type DashboardDeviceSummary = {
  trustedDeviceCount: number;
  activeSessionCount: number;
  pendingApprovalCount: number;
  deviceLimit: number | "unlimited";
};

const DEVICE_INACTIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function getDeviceDisplayStatus(
  device: Pick<DashboardDevice, "lastActiveAt" | "revokedAt">,
  now = new Date(),
): DashboardDeviceDisplayStatus {
  if (device.revokedAt != null) {
    return "revoked";
  }

  if (!device.lastActiveAt) {
    return "inactive";
  }

  const lastActiveTime = new Date(device.lastActiveAt).getTime();
  if (!Number.isFinite(lastActiveTime)) {
    return "inactive";
  }

  return now.getTime() - lastActiveTime > DEVICE_INACTIVE_AFTER_MS
    ? "inactive"
    : "active";
}

export function buildDashboardDeviceSummary(input: {
  devices: DashboardDevice[];
  deviceLimit: number | "unlimited";
  activeSessionCount: number;
  pendingApprovalCount: number;
}): DashboardDeviceSummary {
  return {
    trustedDeviceCount: new Set(
      input.devices
        .filter((device) => device.revokedAt == null)
        .map((device) => device.id),
    ).size,
    activeSessionCount: input.activeSessionCount,
    pendingApprovalCount: input.pendingApprovalCount,
    deviceLimit: input.deviceLimit,
  };
}

export function filterDashboardDevices(
  devices: DashboardDevice[],
  searchQuery: string,
  statusFilter: string,
  now = new Date(),
) {
  const query = searchQuery.trim().toLowerCase();

  return devices.filter((device) => {
    const displayStatus = getDeviceDisplayStatus(device, now);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "trusted" && displayStatus !== "revoked") ||
      statusFilter === displayStatus;
    const matchesQuery =
      query === "" ||
      device.name.toLowerCase().includes(query) ||
      device.id.toLowerCase().includes(query) ||
      displayStatus.startsWith(query);

    return matchesStatus && matchesQuery;
  });
}

export function shortDeviceId(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}
