import { redirect } from "next/navigation";

import { findDashboardAccountForSession } from "@/lib/account";
import { auth } from "@/lib/auth";
import { getDashboardBilling } from "@/lib/billing";
import { DashboardLayout } from "./components/layout/dashboard-layout";

export const dynamic = "force-dynamic";

export default async function AppDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth().catch(() => null);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.invalid) {
    redirect("/login?error=session_expired");
  }

  const account = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  }).catch(() => null);

  if (!account) {
    redirect("/login?error=session_expired");
  }

  const billing = await getDashboardBilling({
    email: account.email,
    username: account.github_username,
  }).catch(() => null);

  const user = {
    name: account.github_username,
    email: account.email,
    plan: billing?.tier
      ? ((billing.tier[0].toUpperCase() +
          billing.tier.slice(1)) as "Free" | "Pro" | "Team")
      : "Free",
  };

  return <DashboardLayout user={user}>{children}</DashboardLayout>;
}
