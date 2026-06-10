import { NextResponse } from "next/server";

import { sendExpiryWarnings } from "../../../../lib/resend";

export async function POST(request: Request) {
  const secret = process.env.EMAIL_JOB_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { emailLog?: string } | null;
  const result = await sendExpiryWarnings({ emailLog: body?.emailLog });
  return NextResponse.json(result);
}
