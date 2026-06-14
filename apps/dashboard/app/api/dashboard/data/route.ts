import { NextResponse } from "next/server";

import { findDashboardAccountForSession } from "../../../../lib/account";
import { auth } from "../../../../lib/auth";
import { getDashboardBilling } from "../../../../lib/billing";
import { listDashboardDevices } from "../../../../lib/devices";
import { listDashboardSyncHistory } from "../../../../lib/history";
import { listDashboardRepositories } from "../../../../lib/repositories";
import { getDashboardUsage } from "../../../../lib/usage";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth().catch(() => null);

  if (!session?.user) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in is required." },
      { status: 401 },
    );
  }

  if (session.invalid) {
    return NextResponse.json(
      {
        error: "SESSION_EXPIRED",
        message: "Your session expired. Please sign in again.",
      },
      { status: 401 },
    );
  }

  const databaseUser = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  }).catch(() => null);

  if (!databaseUser) {
    return NextResponse.json(
      {
        error: "SESSION_EXPIRED",
        message: "Your session expired. Please sign in again.",
      },
      { status: 401 },
    );
  }

  const account = {
    email: databaseUser.email,
    username: databaseUser.github_username,
  };

  try {
    const [repositories, devices, history, usage, billing] = await Promise.all([
      listDashboardRepositories(account),
      listDashboardDevices(account),
      listDashboardSyncHistory(account, { limit: 200 }),
      getDashboardUsage(account),
      getDashboardBilling(account),
    ]);

    return NextResponse.json({
      user: {
        name: databaseUser.github_username,
        email: databaseUser.email,
      },
      repositories,
      devices,
      history,
      usage,
      billing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "DASHBOARD_DATA_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "Dashboard data is unavailable.",
      },
      { status: 500 },
    );
  }
}
