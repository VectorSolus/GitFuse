import type { AuthProvider, DashboardAccount } from "./account";

export function oauthPostLoginRedirect(account: Pick<DashboardAccount, "email_verified_at"> | null) {
  if (!account?.email_verified_at) return "/verify";
  return "/dashboard";
}

export function oauthProviderImpliesVerified(provider: AuthProvider) {
  return provider === "google" || provider === "github";
}

export function oauthEmailVerifiedAt(input: {
  provider: AuthProvider;
  account: Pick<DashboardAccount, "email_verified_at"> | null;
  now?: Date;
}) {
  if (!oauthProviderImpliesVerified(input.provider)) return null;
  if (input.account?.email_verified_at) return null;
  return (input.now ?? new Date()).toISOString();
}

export function oauthSuccessfulSignInResult() {
  return true;
}
