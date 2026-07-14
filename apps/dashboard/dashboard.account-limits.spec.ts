import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
  account: null as unknown,
  limits: null as unknown,
  accountError: null as Error | null,
  limitsError: null as Error | null,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("@/lib/account", () => ({
  findDashboardAccountForSession: vi.fn(async () => {
    if (routeState.accountError) throw routeState.accountError;
    return routeState.account;
  }),
}));

vi.mock("@/lib/account-limits", () => ({
  getDashboardAccountLimits: vi.fn(async () => {
    if (routeState.limitsError) throw routeState.limitsError;
    return routeState.limits;
  }),
}));

import { GET } from "./app/api/account/limits/route";

describe("account limits route database errors", () => {
  beforeEach(() => {
    routeState.session = {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "owner@example.com",
      },
      invalid: false,
    };
    routeState.account = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.com",
    };
    routeState.limits = {
      tier: "free",
      devices: { limit: 2, current: 1 },
      retention_days: 7,
    };
    routeState.accountError = null;
    routeState.limitsError = null;
  });

  it("returns account limits when the database is available", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(routeState.limits);
  });

  it("does not expose account lookup database errors", async () => {
    routeState.accountError = new Error("sorry, too many clients already");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "ACCOUNT_LIMITS_UNAVAILABLE",
      message: "Could not load account limits. Please try again.",
    });
    expect(JSON.stringify(body)).not.toContain("too many clients");
    expect(consoleError).toHaveBeenCalledWith(
      "[api:account:limits:account]",
      routeState.accountError,
    );
    consoleError.mockRestore();
  });

  it("does not expose account limit query database errors", async () => {
    routeState.limitsError = new Error("sorry, too many clients already");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "ACCOUNT_LIMITS_UNAVAILABLE",
      message: "Could not load account limits. Please try again.",
    });
    expect(JSON.stringify(body)).not.toContain("too many clients");
    expect(consoleError).toHaveBeenCalledWith(
      "[api:account:limits:data]",
      routeState.limitsError,
    );
    consoleError.mockRestore();
  });
});
