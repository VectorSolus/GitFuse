export type SelectedDayCommitMetadataInput = {
  device?: string | null;
  sizeBytes?: number | null;
  syncedAt?: string | null;
};

export function formatSelectedDayCommitMetadata(
  input: SelectedDayCommitMetadataInput,
) {
  const parts = [formatHistoryDeviceName(input.device)];
  const size = formatOptionalHistoryBytes(input.sizeBytes);
  if (size) parts.push(size);
  parts.push(formatHistoryTime(input.syncedAt));

  return parts.join(" • ");
}

export function formatHistoryDeviceName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Unknown device";
}

export function formatHistoryTime(value: string | null | undefined) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";

  return date.toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatHistoryBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatOptionalHistoryBytes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatHistoryBytes(value)
    : null;
}
