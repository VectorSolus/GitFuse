import { NextResponse } from "next/server";

import { listDashboardDevices, revokeDashboardDevice } from "../../../../lib/devices";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; githubUsername?: string; fixturePath?: string; revokeDeviceId?: string; revokeLog?: string }
    | null;

  if (!body?.email && !body?.githubUsername) {
    return NextResponse.json({ error: "email or githubUsername is required" }, { status: 400 });
  }

  if (body.revokeDeviceId) {
    const result = await revokeDashboardDevice(
      { email: body.email, username: body.githubUsername },
      body.revokeDeviceId,
      { revokeLog: body.revokeLog }
    );
    return NextResponse.json(result);
  }

  const devices = await listDashboardDevices(
    { email: body.email, username: body.githubUsername },
    { fixturePath: body.fixturePath }
  );

  return NextResponse.json({ devices });
}
