import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { listDashboardSyncHistory } from "./history";
import { summarizeHistoryEvents } from "./history-calendar";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("dashboard sync history", () => {
  it("exposes completed sync analytics and commit details", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "gitfuse-history-"));
    const fixturePath = join(tempDir, "history.json");
    writeFileSync(
      fixturePath,
      JSON.stringify({
        events: [
          {
            id: "sync-event-1",
            eventType: "sync",
            commitCount: 2,
            bundleSizeBytes: 512,
            createdAt: "2026-06-29T04:48:07.429Z",
            repositoryName: "repo-a",
            relayEntryId: "repo-a-relay",
            deviceName: "Piyushs-MacBook-Pro.local",
            commits: [
              {
                sha: "1111111111111111111111111111111111111111",
                message: "first synced commit",
                authorName: "Piyush",
                authorEmail: "piyush@example.com",
                authoredAt: "2026-06-29T04:47:00.000Z",
                committedAt: "2026-06-29T04:47:30.000Z"
              },
              {
                sha: "2222222222222222222222222222222222222222",
                message: "second synced commit",
                authorName: "Piyush",
                authorEmail: "piyush@example.com",
                authoredAt: "2026-06-29T04:48:00.000Z",
                committedAt: "2026-06-29T04:48:05.000Z"
              }
            ]
          }
        ]
      }),
    );

    const history = await listDashboardSyncHistory(
      { email: "piyush@example.com" },
      { fixturePath, year: 2026 },
    );
    const totals = summarizeHistoryEvents(
      history,
      (event) => event.createdAt,
      (event) => event.commitCount,
      (event) => event.repositoryName,
    );

    expect(history).toHaveLength(1);
    expect(totals).toEqual({
      totalCommits: 2,
      syncedDays: 1,
      totalRepos: 1,
      totalBundles: 1,
    });
    expect(history[0].repositoryName).toBe("repo-a");
    expect(history[0].commits[0].message).toBe("first synced commit");
  });
});
