import { getSql } from "./db";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  emailLog?: string | null;
};

type ExpiringBundleRow = {
  email: string;
  display_name: string;
  relay_entry_id: string;
  expires_at: Date | string;
};

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL ?? "gitfuse <notifications@gitfuse.dev>";
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function daysUntil(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function sendEmail(input: EmailInput) {
  if (process.env.NODE_ENV !== "production" && input.emailLog) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(input.emailLog, `to=${input.to} subject=${input.subject}\n`);
    return { id: `log_${Date.now()}` };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html
    }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Resend email failed with status ${response.status}`);
  return (await response.json()) as { id: string };
}

export async function sendBundleExpiryWarning(input: {
  email: string;
  repositoryName: string;
  relayEntryId: string;
  expiresAt: string;
  emailLog?: string | null;
}) {
  const daysRemaining = daysUntil(input.expiresAt);
  return sendEmail({
    to: input.email,
    subject: `gitfuse bundle expiry warning: ${input.repositoryName}`,
    emailLog: input.emailLog,
    html: `
      <h1>Bundle expiry warning</h1>
      <p>${input.repositoryName} has relay bundles expiring in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.</p>
      <p>Relay entry: <code>${input.relayEntryId}</code></p>
      <p>Expiry: ${input.expiresAt}</p>
    `
  });
}

export async function sendBillingReceipt(input: {
  email: string;
  invoiceNumber: string;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  emailLog?: string | null;
}) {
  const amount = new Intl.NumberFormat("en", { currency: input.currency, style: "currency" }).format(
    input.amountPaid / 100
  );
  return sendEmail({
    to: input.email,
    subject: `gitfuse billing receipt ${input.invoiceNumber}`,
    emailLog: input.emailLog,
    html: `
      <h1>Billing receipt</h1>
      <p>Thanks for using gitfuse. We received payment for invoice ${input.invoiceNumber}.</p>
      <p>Amount paid: ${amount}</p>
      ${input.hostedInvoiceUrl ? `<p><a href="${input.hostedInvoiceUrl}">View invoice</a></p>` : ""}
    `
  });
}

export async function sendExpiryWarnings(options: { emailLog?: string | null } = {}) {
  if (process.env.NODE_ENV !== "production" && process.env.GITFUSE_EXPIRY_WARNING_FIXTURE) {
    const { readFile } = await import("node:fs/promises");
    const parsed = JSON.parse(await readFile(process.env.GITFUSE_EXPIRY_WARNING_FIXTURE, "utf8")) as {
      warnings?: Array<{ email: string; repositoryName: string; relayEntryId: string; expiresAt: string }>;
    };
    const warnings = parsed.warnings ?? [];
    await Promise.all(warnings.map((warning) => sendBundleExpiryWarning({ ...warning, emailLog: options.emailLog })));
    return { sent: warnings.length };
  }

  const sql = getSql();
  const rows = await sql<ExpiringBundleRow[]>`
    select distinct
      users.email,
      repositories.display_name,
      repositories.relay_entry_id,
      bundles.expires_at
    from bundles
    join repositories on repositories.id = bundles.repository_id
    join users on users.id = repositories.user_id
    where bundles.status = 'active'
      and bundles.expires_at >= now()
      and bundles.expires_at <= now() + interval '7 days'
    order by bundles.expires_at asc
  `;

  await Promise.all(
    rows.map((row) =>
      sendBundleExpiryWarning({
        email: row.email,
        repositoryName: row.display_name,
        relayEntryId: row.relay_entry_id,
        expiresAt: toIso(row.expires_at),
        emailLog: options.emailLog
      })
    )
  );

  return { sent: rows.length };
}
