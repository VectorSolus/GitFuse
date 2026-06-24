import { NextResponse } from "next/server";

import { getDashboardAccountLimits } from "@/lib/account-limits";
import { findDashboardAccountForSession } from "@/lib/account";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth().catch(() => null);

  if (!session?.user || session.invalid) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in is required." },
      { status: 401 },
    );
  }

  const account = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  }).catch(() => null);

  if (!account) {
    return NextResponse.json(
      { error: "SESSION_EXPIRED", message: "Your session expired. Please sign in again." },
      { status: 401 },
    );
  }

  return NextResponse.json(await getDashboardAccountLimits({ id: account.id }));
}
