import { describe, expect, it } from "vitest";
import {
  githubOAuthEmailFromProfile,
  githubVerifiedEmailScope,
  googleOAuthEmailFromProfile,
  oauthEmailVerifiedAt,
  oauthPostLoginRedirect,
  oauthSuccessfulSignInResult,
} from "./lib/auth-oauth";

describe("OAuth verification redirect", () => {
  it("new Google OAuth signup routes straight to dashboard and marks email verified", () => {
    expect(
      oauthEmailVerifiedAt({
        provider: "google",
        emailVerified: true,
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
        emailVerified: true,
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
        emailVerified: true,
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
        emailVerified: true,
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

  it("requires Google to provide a verified email before account linking", () => {
    expect(
      googleOAuthEmailFromProfile({
        profile: {
          email: " User@Example.COM ",
          email_verified: true,
        },
      }),
    ).toEqual({
      ok: true,
      email: "user@example.com",
      verified: true,
    });

    expect(
      googleOAuthEmailFromProfile({
        profile: {
          email: "user@example.com",
          email_verified: false,
        },
      }),
    ).toEqual({
      ok: false,
      email: "user@example.com",
      reason: "unverified_email",
    });
  });

  it("uses GitHub's verified primary email when user:email is available", async () => {
    const fetcher = async () =>
      ({
        ok: true,
        json: async () => [
          {
            email: "secondary@example.com",
            primary: false,
            verified: true,
          },
          {
            email: " Primary@Example.COM ",
            primary: true,
            verified: true,
          },
        ],
      }) as Response;

    await expect(
      githubOAuthEmailFromProfile({
        profile: { email: "public@example.com" },
        accessToken: "gho_test",
        fetcher,
      }),
    ).resolves.toEqual({
      ok: true,
      email: "primary@example.com",
      verified: true,
    });
  });

  it("fails safely when GitHub cannot prove a verified primary email", async () => {
    await expect(
      githubOAuthEmailFromProfile({
        profile: { email: "public@example.com" },
      }),
    ).resolves.toEqual({
      ok: false,
      email: "public@example.com",
      reason: "github_verified_email_scope_required",
    });

    expect(githubVerifiedEmailScope).toBe("user:email");
  });
});
