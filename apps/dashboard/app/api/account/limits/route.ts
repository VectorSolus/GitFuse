import { NextResponse } from "next/server";

import { getDashboardAccountLimits } from "@/lib/account-limits";
import { findDashboardAccountForSession } from "@/lib/account";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth().catch((error) => {
    console.error("[api:account:limits:auth]", error);
    return "auth_unavailable" as const;
  });

  if (session === "auth_unavailable") {
    return NextResponse.json(
      {
        error: "ACCOUNT_LIMITS_UNAVAILABLE",
        message: "Could not load account limits. Please try again.",
      },
      { status: 503 },
    );
  }

  if (!session?.user || session.invalid) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in is required." },
      { status: 401 },
    );
  }

  const account = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  }).catch((error) => {
    console.error("[api:account:limits:account]", error);
    return "account_unavailable" as const;
  });

  if (account === "account_unavailable") {
    return NextResponse.json(
      {
        error: "ACCOUNT_LIMITS_UNAVAILABLE",
        message: "Could not load account limits. Please try again.",
      },
      { status: 503 },
    );
  }

  if (!account) {
    return NextResponse.json(
      { error: "SESSION_EXPIRED", message: "Your session expired. Please sign in again." },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await getDashboardAccountLimits({ id: account.id }));
  } catch (error) {
    console.error("[api:account:limits:data]", error);
    return NextResponse.json(
      {
        error: "ACCOUNT_LIMITS_UNAVAILABLE",
        message: "Could not load account limits. Please try again.",
      },
      { status: 503 },
    );
  }
}
