import { NextResponse } from "next/server";

import { listDashboardSyncHistory } from "../../../../lib/history";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; githubUsername?: string; fixturePath?: string }
    | null;

  if (!body?.email && !body?.githubUsername) {
    return NextResponse.json({ error: "email or githubUsername is required" }, { status: 400 });
  }

  const events = await listDashboardSyncHistory(
    { email: body.email, username: body.githubUsername },
    { fixturePath: body.fixturePath }
  );

  return NextResponse.json({ events });
}
