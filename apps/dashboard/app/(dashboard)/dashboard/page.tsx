import { redirect } from "next/navigation";

import { auth } from "../../../lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.name ?? session.user.email}.</p>
    </main>
  );
}
