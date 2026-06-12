import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import { getDashboardBilling } from "../../../../lib/billing";
import { listDashboardDevices } from "../../../../lib/devices";
import { listDashboardSyncHistory } from "../../../../lib/history";
import { listDashboardRepositories } from "../../../../lib/repositories";
import { getDashboardUsage } from "../../../../lib/usage";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth().catch(() => null);
  const account = {
    email: session?.user?.email,
    username: session?.user?.name
  };

  try {
    const [repositories, devices, history, usage, billing] = await Promise.all([
      listDashboardRepositories(account),
      listDashboardDevices(account),
      listDashboardSyncHistory(account, { limit: 200 }),
      getDashboardUsage(account),
      getDashboardBilling(account)
    ]);

    return NextResponse.json({
      user: {
        name: session?.user?.name ?? "",
        email: session?.user?.email ?? ""
      },
      repositories,
      devices,
      history,
      usage,
      billing
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "DASHBOARD_DATA_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Dashboard data is unavailable."
      },
      { status: 500 }
    );
  }
}
