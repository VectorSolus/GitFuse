import { NextResponse } from "next/server";

import { sendBillingReceipt, sendBundleExpiryWarning, sendExpiryWarnings } from "../../../../lib/resend";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        kind?: "expiry" | "receipt" | "expiry-job";
        email?: string;
        emailLog?: string;
        repositoryName?: string;
        relayEntryId?: string;
        expiresAt?: string;
        invoiceNumber?: string;
        amountPaid?: number;
        currency?: string;
        hostedInvoiceUrl?: string;
      }
    | null;

  if (body?.kind === "expiry-job") {
    return NextResponse.json(await sendExpiryWarnings({ emailLog: body.emailLog }));
  }

  if (!body?.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (body.kind === "receipt") {
    return NextResponse.json(
      await sendBillingReceipt({
        email: body.email,
        invoiceNumber: body.invoiceNumber ?? "INV-TEST",
        amountPaid: body.amountPaid ?? 0,
        currency: body.currency ?? "USD",
        hostedInvoiceUrl: body.hostedInvoiceUrl,
        emailLog: body.emailLog
      })
    );
  }

  return NextResponse.json(
    await sendBundleExpiryWarning({
      email: body.email,
      repositoryName: body.repositoryName ?? "test-repo",
      relayEntryId: body.relayEntryId ?? "test-entry",
      expiresAt: body.expiresAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      emailLog: body.emailLog
    })
  );
}
