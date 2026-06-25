import { describe, expect, it } from "vitest";
import {
  oauthEmailVerifiedAt,
  oauthPostLoginRedirect,
  oauthSuccessfulSignInResult,
} from "./lib/auth-oauth";

describe("OAuth verification redirect", () => {
  it("new Google OAuth signup routes straight to dashboard and marks email verified", () => {
    expect(
      oauthEmailVerifiedAt({
        provider: "google",
        account: null,
        now: new Date("2026-06-24T00:00:00.000Z"),
      }),
    ).toBe("2026-06-24T00:00:00.000Z");
    expect(oauthSuccessfulSignInResult()).toBe(true);
  });

  it("returning Google OAuth login routes straight to dashboard without re-verification", () => {
    expect(
      oauthPostLoginRedirect({
        email_verified_at: "2026-06-24T00:00:00.000Z",
      }),
    ).toBe("/dashboard");
    expect(
      oauthEmailVerifiedAt({
        provider: "google",
        account: {
          email_verified_at: "2026-06-24T00:00:00.000Z",
        },
      }),
    ).toBeNull();
    expect(oauthSuccessfulSignInResult()).toBe(true);
  });

  it("new GitHub OAuth signup routes straight to dashboard and marks email verified", () => {
    expect(
      oauthEmailVerifiedAt({
        provider: "github",
        account: null,
        now: new Date("2026-06-24T00:00:00.000Z"),
      }),
    ).toBe("2026-06-24T00:00:00.000Z");
    expect(oauthSuccessfulSignInResult()).toBe(true);
  });

  it("returning GitHub OAuth login routes straight to dashboard without re-verification", () => {
    expect(
      oauthPostLoginRedirect({
        email_verified_at: "2026-06-24T00:00:00.000Z",
      }),
    ).toBe("/dashboard");
    expect(
      oauthEmailVerifiedAt({
        provider: "github",
        account: {
          email_verified_at: "2026-06-24T00:00:00.000Z",
        },
      }),
    ).toBeNull();
    expect(oauthSuccessfulSignInResult()).toBe(true);
  });

  it("continues the Auth.js OAuth callback so the session cookie is written", () => {
    expect(oauthSuccessfulSignInResult()).toBe(true);
    expect(typeof oauthSuccessfulSignInResult()).toBe("boolean");
  });

  it("unverified accounts still require the non-OAuth verification step", () => {
    expect(oauthPostLoginRedirect(null)).toBe("/verify");
  });
});
