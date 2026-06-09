import { NextResponse } from "next/server";

import { approveCliAuthSession } from "../../../../lib/cli-auth";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { code?: string; githubUsername?: string; email?: string; approvalLog?: string }
    | null;

  if (!body?.code || !body.githubUsername) {
    return NextResponse.json({ error: "code and githubUsername are required" }, { status: 400 });
  }

  const result = await approveCliAuthSession({
    code: body.code,
    githubUsername: body.githubUsername,
    email: body.email,
    approvalLog: body.approvalLog
  });

  return NextResponse.json(result);
}
