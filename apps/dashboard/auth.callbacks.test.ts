import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  config: null as null | {
    callbacks: {
      signIn: (input: {
        account?: { provider: string; providerAccountId?: string } | null;
        profile?: Record<string, unknown> | null;
        user: { id?: string; email?: string | null };
      }) => Promise<boolean>;
      jwt: (input: {
        token: Record<string, unknown>;
        user?: { id?: string; email?: string | null };
        account?: { provider: string; providerAccountId: string } | null;
      }) => Promise<Record<string, unknown>>;
    };
  },
}));

const accountState = vi.hoisted(() => ({
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    github_id: "google:google-user-1",
    github_username: "Piyush",
    display_name: "Piyush",
    email: "piyush@example.com",
    email_verified_at: "2026-07-06T00:00:00.000Z",
    password_hash: null,
  },
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findByProviderIdentity: vi.fn(),
  upsertAccount: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config) => {
    authState.config = config;
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => ({ id: "credentials", ...config })),
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn((config) => ({ id: "github", ...config })),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((config) => ({ id: "google", ...config })),
}));

vi.mock("./lib/account", () => ({
  findDashboardAccountByEmail: accountState.findByEmail,
  findDashboardAccountById: accountState.findById,
  findDashboardAccountByProviderIdentity: accountState.findByProviderIdentity,
  upsertDashboardAccount: accountState.upsertAccount,
}));

vi.mock("./lib/auth-email", () => ({
  authorizeEmailPassword: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
  authState.config = null;
  accountState.findByEmail.mockReset();
  accountState.findById.mockReset();
  accountState.findByProviderIdentity.mockReset();
  accountState.upsertAccount.mockReset();
  accountState.findByProviderIdentity.mockResolvedValue(accountState.user);
  accountState.findByEmail.mockResolvedValue(accountState.user);
  accountState.findById.mockResolvedValue(accountState.user);
  accountState.upsertAccount.mockResolvedValue({
    user: accountState.user,
    plan: { tier: "free" },
  });
  await import("./lib/auth");
});

describe("Auth.js database callbacks", () => {
  it("allows OAuth sign-in when the database is available", async () => {
    const result = await authState.config?.callbacks.signIn({
      account: {
        provider: "google",
        providerAccountId: "google-user-1",
      },
      profile: {
        sub: "google-user-1",
        name: "Piyush",
        email: "piyush@example.com",
      },
      user: {
        email: "piyush@example.com",
      },
    });

    expect(result).toBe(true);
    expect(accountState.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        providerAccountId: "google-user-1",
        username: "Piyush",
        email: "piyush@example.com",
      }),
    );
  });

  it("logs and rethrows database failures instead of succeeding auth", async () => {
    const databaseError = new Error("sorry, too many clients already");
    accountState.findByProviderIdentity.mockRejectedValueOnce(databaseError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      authState.config?.callbacks.signIn({
        account: {
          provider: "google",
          providerAccountId: "google-user-1",
        },
        profile: {
          sub: "google-user-1",
          name: "Piyush",
          email: "piyush@example.com",
        },
        user: {
          email: "piyush@example.com",
        },
      }),
    ).rejects.toThrow("sorry, too many clients already");

    expect(accountState.upsertAccount).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[auth:oauth-sign-in] database operation failed",
      databaseError,
    );
    consoleError.mockRestore();
  });

  it("keeps JWT sessions valid when the database lookup succeeds", async () => {
    const token = await authState.config?.callbacks.jwt({
      token: { sub: accountState.user.id },
      account: null,
    });

    expect(token).toMatchObject({
      sub: accountState.user.id,
      name: accountState.user.display_name,
      email: accountState.user.email,
    });
    expect(token?.invalid).toBeUndefined();
    expect(token?.error).toBeUndefined();
  });
});
