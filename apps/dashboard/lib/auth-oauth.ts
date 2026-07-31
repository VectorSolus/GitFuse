import type { AuthProvider, DashboardAccount } from "./account";
import { normalizeEmail } from "./otp";

export const githubVerifiedEmailScope = "user:email";
export const githubVerifiedEmailEndpoint = "https://api.github.com/user/emails";

type OAuthProfile = Record<string, unknown>;
type OAuthEmailResolution =
  | { ok: true; email: string; verified: true }
  | {
      ok: false;
      email: string;
      reason:
        | "missing_email"
        | "unverified_email"
        | "github_verified_email_scope_required";
    };

type GitHubEmail = {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
};

export function oauthPostLoginRedirect(account: Pick<DashboardAccount, "email_verified_at"> | null) {
  if (!account?.email_verified_at) return "/verify";
  return "/dashboard";
}

function profileValue(profile: OAuthProfile, key: string) {
  const value = profile[key];
  return value === null || value === undefined ? "" : String(value);
}

function profileBoolean(profile: OAuthProfile, key: string) {
  return profile[key] === true || profile[key] === "true";
}

export function googleOAuthEmailFromProfile(input: {
  profile: OAuthProfile;
  userEmail?: string | null;
}): OAuthEmailResolution {
  const email = normalizeEmail(input.userEmail ?? profileValue(input.profile, "email"));
  if (!email) return { ok: false, email: "", reason: "missing_email" };

  const verified =
    profileBoolean(input.profile, "email_verified") ||
    profileBoolean(input.profile, "verified_email");

  if (!verified) {
    return { ok: false, email, reason: "unverified_email" };
  }

  return { ok: true, email, verified: true };
}

export async function githubOAuthEmailFromProfile(input: {
  profile: OAuthProfile;
  userEmail?: string | null;
  accessToken?: string | null;
  fetcher?: typeof fetch;
}): Promise<OAuthEmailResolution> {
  const profileEmail = normalizeEmail(
    input.userEmail ?? profileValue(input.profile, "email"),
  );

  if (
    profileEmail &&
    (profileBoolean(input.profile, "email_verified") ||
      profileBoolean(input.profile, "verified_email"))
  ) {
    return { ok: true, email: profileEmail, verified: true };
  }

  if (!input.accessToken) {
    return {
      ok: false,
      email: profileEmail,
      reason: "github_verified_email_scope_required",
    };
  }

  try {
    // GitHub's profile email does not prove verification; the user:email scope
    // lets us read the verified primary email before canonical account linking.
    const response = await (input.fetcher ?? fetch)(githubVerifiedEmailEndpoint, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.accessToken}`,
        "x-github-api-version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        email: profileEmail,
        reason: "github_verified_email_scope_required",
      };
    }

    const emails = (await response.json()) as GitHubEmail[];
    const primaryVerified = emails.find(
      (email) =>
        typeof email.email === "string" &&
        email.primary === true &&
        email.verified === true,
    );
    const email = normalizeEmail(String(primaryVerified?.email ?? ""));

    if (!email) {
      return {
        ok: false,
        email: profileEmail,
        reason: "unverified_email",
      };
    }

    return { ok: true, email, verified: true };
  } catch (error) {
    console.error("[auth:github-email] verified email lookup failed", error);
    return {
      ok: false,
      email: profileEmail,
      reason: "github_verified_email_scope_required",
    };
  }
}

export async function oauthVerifiedEmail(input: {
  provider: AuthProvider;
  profile: OAuthProfile;
  userEmail?: string | null;
  accessToken?: string | null;
}) {
  if (input.provider === "google") {
    return googleOAuthEmailFromProfile(input);
  }

  if (input.provider === "github") {
    return githubOAuthEmailFromProfile(input);
  }

  return {
    ok: false as const,
    email: normalizeEmail(input.userEmail ?? profileValue(input.profile, "email")),
    reason: "unverified_email" as const,
  };
}

export function oauthEmailVerifiedAt(input: {
  provider: AuthProvider;
  emailVerified: boolean;
  account: Pick<DashboardAccount, "email_verified_at"> | null;
  now?: Date;
}) {
  if (!input.emailVerified) return null;
  if (input.account?.email_verified_at) return null;
  return (input.now ?? new Date()).toISOString();
}

export function oauthSuccessfulSignInResult() {
  return true;
}
