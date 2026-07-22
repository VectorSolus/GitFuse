import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
  account: null as unknown,
  billing: { tier: "free" },
  security: { pairingPinSet: true },
}));

vi.mock("./lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("./lib/account", () => ({
  findDashboardAccountForSession: vi.fn(async () => routeState.account),
}));

vi.mock("./lib/billing", () => ({
  getDashboardBilling: vi.fn(async () => routeState.billing),
}));

vi.mock("./lib/pairing-pin", () => ({
  getPairingSecuritySummary: vi.fn(async () => routeState.security),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  }),
}));

vi.mock("./app/(dashboard)/components/layout/dashboard-layout", () => ({
  DashboardLayout: ({ children, user }: { children: ReactNode; user: unknown }) => ({
    children,
    user,
  }),
}));

import AppDashboardLayout from "./app/(dashboard)/layout";
import { findDashboardAccountForSession } from "./lib/account";
import { redirect } from "next/navigation";

function verifiedAccount() {
  return {
    id: "user_123",
    github_id: "github:123",
    github_username: "octo",
    email: "octo@example.com",
    email_verified_at: "2026-06-24T00:00:00.000Z",
    password_hash: null,
  };
}

async function expectRedirect(url: string) {
  await expect(
    AppDashboardLayout({ children: "dashboard" }),
  ).rejects.toMatchObject({
    digest: expect.stringContaining(url),
  });
  expect(redirect).toHaveBeenCalledWith(url);
}

describe("dashboard route guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.session = null;
    routeState.account = null;
    routeState.billing = { tier: "free" };
    routeState.security = { pairingPinSet: true };
  });

  it("redirects a request without a session to /login", async () => {
    await expectRedirect("/login");
  });

  it("allows a verified OAuth session through the dashboard layout guard", async () => {
    routeState.session = {
      user: {
        id: "user_123",
        email: "octo@example.com",
      },
    };
    routeState.account = verifiedAccount();

    const result = await AppDashboardLayout({ children: "dashboard" });

    expect(result.props.children).toBe("dashboard");
    expect(result.props.user).toMatchObject({
      email: "octo@example.com",
      name: "octo",
      plan: "Free",
    });
    expect(result.props.needsPairingPinOnboarding).toBe(false);
    expect(findDashboardAccountForSession).toHaveBeenCalledWith({
      id: "user_123",
      email: "octo@example.com",
    });
  });

  it("passes onboarding state when the account has no pairing PIN", async () => {
    routeState.session = {
      user: {
        id: "user_123",
        email: "octo@example.com",
      },
    };
    routeState.account = verifiedAccount();
    routeState.security = { pairingPinSet: false };

    const result = await AppDashboardLayout({ children: "dashboard" });

    expect(result.props.needsPairingPinOnboarding).toBe(true);
  });

  it("redirects an authenticated but unverified account to /verify", async () => {
    routeState.session = {
      user: {
        id: "user_123",
        email: "octo@example.com",
      },
    };
    routeState.account = {
      ...verifiedAccount(),
      email_verified_at: null,
    };

    await expectRedirect("/verify");
  });
});
