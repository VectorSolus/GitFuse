import { NextResponse } from "next/server";
import {
  availableHistoryYears,
  resolvePermittedHistoryYear,
} from "@gitfuse/types/billing";

import {
  findDashboardAccountAuthProviders,
  findDashboardAccountForSession,
} from "../../../../lib/account";
import { auth } from "../../../../lib/auth";
import { getDashboardBilling } from "../../../../lib/billing";
import {
  countPendingDashboardDeviceApprovals,
  listDashboardDevices,
} from "../../../../lib/devices";
import { buildDashboardDeviceSummary } from "../../../../lib/device-summary";
import { listDashboardSyncHistory } from "../../../../lib/history";
import { listDashboardRepositories } from "../../../../lib/repositories";
import { getPairingSecuritySummary } from "../../../../lib/pairing-pin";
import { getDashboardUsage } from "../../../../lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().catch((error) => {
    console.error("[api:dashboard:data:auth]", error);
    return "auth_unavailable" as const;
  });

  if (session === "auth_unavailable") {
    return NextResponse.json(
      {
        error: "DASHBOARD_DATA_UNAVAILABLE",
        message: "Could not load dashboard data.",
      },
      { status: 503 },
    );
  }

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
  }).catch((error) => {
    console.error("[api:dashboard:data:account]", error);
    return "account_unavailable" as const;
  });

  if (databaseUser === "account_unavailable") {
    return NextResponse.json(
      {
        error: "DASHBOARD_DATA_UNAVAILABLE",
        message: "Could not load dashboard data.",
      },
      { status: 503 },
    );
  }

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
    id: databaseUser.id,
    email: databaseUser.email,
    username: databaseUser.github_username,
  };

  try {
    const billing = await getDashboardBilling(account);
    const currentYear = new Date().getFullYear();
    const requestedYearValue = Number(
      new URL(request.url).searchParams.get("year"),
    );
    const requestedYear = Number.isInteger(requestedYearValue)
      ? requestedYearValue
      : null;
    const requestedTimezoneOffset = Number(
      new URL(request.url).searchParams.get("tzOffset"),
    );
    const timezoneOffsetMinutes = Number.isFinite(requestedTimezoneOffset)
      ? Math.max(-840, Math.min(840, requestedTimezoneOffset))
      : 0;
    const selectedYear = resolvePermittedHistoryYear(
      billing.tier,
      requestedYear,
      currentYear,
    );
    const historyYears = availableHistoryYears(
      billing.tier,
      currentYear,
    );

    const [
      repositories,
      devices,
      history,
      usage,
      pendingApprovalCount,
      security,
      authProviders,
    ] = await Promise.all([
      listDashboardRepositories(account),
      listDashboardDevices(account),
      listDashboardSyncHistory(account, {
        limit: 5000,
        year: selectedYear,
        timezoneOffsetMinutes,
      }),
      getDashboardUsage(account),
      countPendingDashboardDeviceApprovals(account.id),
      getPairingSecuritySummary(account.id),
      findDashboardAccountAuthProviders(account.id),
    ]);
    const deviceSummary = buildDashboardDeviceSummary({
      devices,
      deviceLimit: usage.devices.max,
      activeSessionCount: 1,
      pendingApprovalCount,
    });

    return NextResponse.json({
      user: {
        name: databaseUser.display_name || databaseUser.github_username,
        email: databaseUser.email,
      },
      repositories,
      devices,
      deviceSummary,
      history,
      usage,
      billing,
      security,
      authProviders,
      historyYears,
      selectedHistoryYear: selectedYear,
    }, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api:dashboard:data]", error);
    return NextResponse.json(
      {
        error: "DASHBOARD_DATA_UNAVAILABLE",
        message: "Could not load dashboard data.",
      },
      { status: 500 },
    );
  }
}
