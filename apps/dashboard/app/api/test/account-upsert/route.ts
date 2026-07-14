import { NextResponse } from "next/server";

import { upsertDashboardAccount } from "../../../../lib/account";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { githubId?: string; githubUsername?: string; email?: string }
    | null;

  if (!body?.githubId || !body.githubUsername || !body.email) {
    return NextResponse.json({ error: "githubId, githubUsername, and email are required" }, { status: 400 });
  }

  const account = await upsertDashboardAccount({
    githubId: body.githubId,
    githubUsername: body.githubUsername,
    email: body.email,
  });

  return NextResponse.json({
    userId: account.user.id,
    tier: account.plan?.tier ?? "free",
  });
}
