import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
}));

vi.mock("./lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("./app/home-page-client", () => ({
  HomePageClient: vi.fn(() => null),
}));

import { redirect } from "next/navigation";

import HomePage from "./app/page";
import { HomePageClient } from "./app/home-page-client";

describe("public home page session redirect", () => {
  beforeEach(() => {
    routeState.session = null;
    vi.mocked(redirect).mockClear();
  });

  it("redirects an authenticated user to the dashboard", async () => {
    routeState.session = {
      user: { id: "user-1", email: "owner@example.com" },
      invalid: false,
    };

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the existing landing page for an anonymous user", async () => {
    const result = await HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(result.type).toBe(HomePageClient);
  });

  it("renders the landing page when an existing session is invalid", async () => {
    routeState.session = {
      user: { id: "user-1", email: "owner@example.com" },
      invalid: true,
    };

    const result = await HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(result.type).toBe(HomePageClient);
  });
});
