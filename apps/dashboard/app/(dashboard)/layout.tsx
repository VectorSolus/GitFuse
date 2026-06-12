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
  const billing = session?.user
    ? await getDashboardBilling({
        email: session.user.email,
        username: session.user.name
      }).catch(() => null)
    : null;

  const user = {
    name: session?.user?.name ?? "GitFuse",
    email: session?.user?.email ?? "",
    plan: billing?.tier ? ((billing.tier[0].toUpperCase() + billing.tier.slice(1)) as "Free" | "Pro" | "Team") : "Free",
  };

  return <DashboardLayout user={user}>{children}</DashboardLayout>;
}
