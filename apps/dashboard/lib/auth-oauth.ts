import type { DashboardAccount } from "./account";

export function oauthPostLoginRedirect(account: Pick<DashboardAccount, "email_verified_at"> | null) {
  if (!account?.email_verified_at) return "/verify";
  return "/dashboard";
}
