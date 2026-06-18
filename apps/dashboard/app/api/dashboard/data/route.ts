import { NextResponse } from "next/server";
import {
  availableHistoryYears,
  resolvePermittedHistoryYear,
} from "@gitfuse/types/billing";

import { findDashboardAccountForSession } from "../../../../lib/account";
import { auth } from "../../../../lib/auth";
import { getDashboardBilling } from "../../../../lib/billing";
import { listDashboardDevices } from "../../../../lib/devices";
import { listDashboardSyncHistory } from "../../../../lib/history";
import { listDashboardRepositories } from "../../../../lib/repositories";
import { getDashboardUsage } from "../../../../lib/usage";

export const runtime = "nodejs";

export async function GET(request: Request) {
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

    const [repositories, devices, history, usage] = await Promise.all([
      listDashboardRepositories(account),
      listDashboardDevices(account),
      listDashboardSyncHistory(account, {
        limit: 5000,
        year: selectedYear,
        timezoneOffsetMinutes,
      }),
      getDashboardUsage(account),
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
      historyYears,
      selectedHistoryYear: selectedYear,
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
