import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  responses: [] as unknown[][],
  queries: [] as Array<{ sql: string; values: unknown[] }>,
}));

vi.mock("./db", () => ({
  getSql: () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      dbState.queries.push({
        sql: strings.join("?"),
        values,
      });
      return dbState.responses.shift() ?? [];
    },
}));

import { findDashboardAccountForSession } from "./account";

const canonicalUser = {
  id: "00000000-0000-4000-8000-000000060101",
  github_id: "google:google-user",
  github_username: "Canonical",
  display_name: "Canonical",
  email: "oauth.user@example.com",
  email_verified_at: "2026-07-31T00:00:00.000Z",
  password_hash: null,
};

describe("findDashboardAccountForSession", () => {
  beforeEach(() => {
    dbState.responses = [];
    dbState.queries = [];
  });

  it("uses a valid session user id before email lookup", async () => {
    dbState.responses = [[canonicalUser]];

    await expect(
      findDashboardAccountForSession({
        id: canonicalUser.id,
        email: "other@example.com",
      }),
    ).resolves.toEqual(canonicalUser);

    expect(dbState.queries).toHaveLength(1);
    expect(dbState.queries[0].values).toContain(canonicalUser.id);
  });

  it("falls back to normalized session email when the session user id is stale", async () => {
    dbState.responses = [[], [canonicalUser]];

    await expect(
      findDashboardAccountForSession({
        id: "00000000-0000-4000-8000-000000060999",
        email: " OAuth.User@Example.COM ",
      }),
    ).resolves.toEqual(canonicalUser);

    expect(dbState.queries).toHaveLength(2);
    expect(dbState.queries[1].values).toContain(canonicalUser.email);
  });
});
