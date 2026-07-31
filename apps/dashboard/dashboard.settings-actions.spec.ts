import { beforeEach, describe, expect, it, vi } from "vitest";

const actionState = vi.hoisted(() => ({
  session: null as null | {
    invalid?: boolean;
    user?: {
      id?: string | null;
      email?: string | null;
    };
  },
  account: null as null | {
    id: string;
    email: string;
  },
  cooldown: false,
  deleteResult: { ok: true as const },
  sent: [] as Array<{ email: string; code: string; purpose: string }>,
  lookupInputs: [] as Array<{ id?: string | null; email?: string | null }>,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => actionState.session),
}));

vi.mock("@/lib/account", () => ({
  findDashboardAccountForSession: vi.fn(
    async (input: { id?: string | null; email?: string | null }) => {
      actionState.lookupInputs.push(input);
      return actionState.account;
    },
  ),
  updateDashboardAccountProfile: vi.fn(),
}));

vi.mock("@/lib/account-delete", () => ({
  deleteDashboardAccountWithOtp: vi.fn(async () => actionState.deleteResult),
}));

vi.mock("@/lib/db", () => ({
  getSql: vi.fn(() => {
    throw new Error("settings action test should not touch raw sql");
  }),
}));

vi.mock("@/lib/otp", () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  isOtpCooldownActive: vi.fn(async () => actionState.cooldown),
  createOtp: vi.fn(async () => "123456"),
  sendOtpEmail: vi.fn(async (email: string, code: string, purpose: string) => {
    actionState.sent.push({ email, code, purpose });
  }),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/pairing-pin", () => ({
  requestPairingPinRevealOtp: vi.fn(),
  revealPairingPinWithOtp: vi.fn(),
  setPairingPin: vi.fn(),
}));

import { findDashboardAccountForSession } from "@/lib/account";
import { deleteDashboardAccountWithOtp } from "@/lib/account-delete";
import { createOtp, sendOtpEmail } from "@/lib/otp";
import {
  deleteCurrentAccountAction,
  requestDeleteAccountOtp,
} from "./app/(dashboard)/dashboard/settings/actions";

const canonicalUser = {
  id: "00000000-0000-4000-8000-000000060001",
  email: "oauth.user@example.com",
};

describe("settings actions current user resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionState.session = {
      user: {
        id: "google-provider-sub",
        email: " OAuth.User@Example.COM ",
      },
    };
    actionState.account = canonicalUser;
    actionState.cooldown = false;
    actionState.deleteResult = { ok: true };
    actionState.sent = [];
    actionState.lookupInputs = [];
  });

  it("Google OAuth-style sessions can request delete-account OTP", async () => {
    await expect(requestDeleteAccountOtp()).resolves.toEqual({
      ok: true,
      email: canonicalUser.email,
    });

    expect(findDashboardAccountForSession).toHaveBeenCalledWith({
      id: "google-provider-sub",
      email: canonicalUser.email,
    });
    expect(createOtp).toHaveBeenCalledWith(
      canonicalUser.id,
      canonicalUser.email,
      "delete_account",
    );
    expect(sendOtpEmail).toHaveBeenCalledWith(
      canonicalUser.email,
      "123456",
      "delete_account",
    );
  });

  it("Google OAuth-style sessions do not get the signed-out delete-account error", async () => {
    const result = await requestDeleteAccountOtp();

    expect(result.ok).toBe(true);
    expect(result.error).not.toBe("You must be signed in to delete your account.");
  });

  it("Google OAuth-style sessions confirm deletion with the canonical user id and OTP", async () => {
    await expect(
      deleteCurrentAccountAction({ otpCode: "654321" }),
    ).resolves.toEqual({
      ok: true,
      redirectTo: "/",
    });

    expect(deleteDashboardAccountWithOtp).toHaveBeenCalledWith({
      userId: canonicalUser.id,
      otpCode: "654321",
    });
  });

  it("unauthenticated sessions still cannot request delete-account OTP", async () => {
    actionState.session = null;

    await expect(requestDeleteAccountOtp()).resolves.toEqual({
      ok: false,
      error: "You must be signed in to delete your account.",
    });
    expect(createOtp).not.toHaveBeenCalled();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it("Email OTP sessions keep the existing delete-account OTP behavior", async () => {
    actionState.session = {
      user: {
        id: canonicalUser.id,
        email: canonicalUser.email,
      },
    };

    await expect(requestDeleteAccountOtp()).resolves.toEqual({
      ok: true,
      email: canonicalUser.email,
    });
    expect(actionState.lookupInputs.at(-1)).toEqual({
      id: canonicalUser.id,
      email: canonicalUser.email,
    });
    expect(actionState.sent).toEqual([
      {
        email: canonicalUser.email,
        code: "123456",
        purpose: "delete_account",
      },
    ]);
  });
});
