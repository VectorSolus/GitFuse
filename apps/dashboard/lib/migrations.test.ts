import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const journalPath = fileURLToPath(
  new URL("../../../packages/db/migrations/meta/_journal.json", import.meta.url),
);

describe("database migrations", () => {
  it("registers the sync event commit read-model migration", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries?: Array<{ tag?: string }>;
    };

    expect(journal.entries?.map((entry) => entry.tag)).toContain(
      "0004_sync_event_commits",
    );
  });
});
