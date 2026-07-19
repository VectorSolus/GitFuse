import assert from "node:assert/strict";
import { test } from "vitest";

import { formatSelectedDayCommitMetadata } from "./history-card";

test("selected day commit metadata uses device, size, and time", () => {
  assert.equal(
    formatSelectedDayCommitMetadata({
      device: "Piyushs-MacBook-Pro.local",
      sizeBytes: 1638,
      syncedAt: "2026-07-09T23:29:00",
    }),
    "Piyushs-MacBook-Pro.local • 1.6 KB • 11:29 PM",
  );
});

test("selected day commit metadata excludes relay ids and event labels", () => {
  const metadata = formatSelectedDayCommitMetadata({
    device: "Piyushs-MacBook-Pro.local",
    sizeBytes: 512,
    syncedAt: "2026-07-09T11:29:00",
    relayEntryId: "repo-task062-v4-20260709124321",
    direction: "sync",
  } as Parameters<typeof formatSelectedDayCommitMetadata>[0] & {
    relayEntryId: string;
    direction: string;
  });

  assert.equal(metadata, "Piyushs-MacBook-Pro.local • 512 B • 11:29 AM");
  assert.equal(metadata.includes("repo-task062-v4-20260709124321"), false);
  assert.equal(metadata.includes("sync"), false);
});

test("selected day commit metadata handles missing values gracefully", () => {
  assert.equal(
    formatSelectedDayCommitMetadata({
      device: " ",
      sizeBytes: null,
      syncedAt: null,
    }),
    "Unknown device • Unknown time",
  );

  assert.equal(
    formatSelectedDayCommitMetadata({
      device: null,
      syncedAt: "not-a-date",
    }),
    "Unknown device • Unknown time",
  );
});
