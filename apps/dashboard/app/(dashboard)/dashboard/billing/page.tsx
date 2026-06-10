import { redirect } from "next/navigation";

import { auth } from "../../../../lib/auth";
import {
  type DashboardBilling,
  createBillingCheckoutSession,
  getDashboardBilling,
  tierLimitSummary,
  tierPriceLabel
} from "../../../../lib/billing";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en", {
    currency,
    style: "currency"
  }).format(cents / 100);
}

function PlanCard({
  tier,
  currentTier,
  account
}: {
  tier: "pro" | "team";
  currentTier: DashboardBilling["tier"];
  account: { email?: string | null; username?: string | null };
}) {
  const limits = tierLimitSummary(tier);
  const isCurrent = currentTier === tier;

  async function upgrade() {
    "use server";
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const session = await createBillingCheckoutSession({
      tier,
      email: account.email,
      username: account.username,
      successUrl: `${baseUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${baseUrl}/dashboard/billing?checkout=cancelled`
    });
    redirect(session.url);
  }

  return (
    <section className="billing-plan">
      <header>
        <span>{tier}</span>
        <strong>{tierPriceLabel(tier)}</strong>
      </header>
      <ul>
        <li>{limits.repos}</li>
        <li>{limits.devices}</li>
        <li>{limits.history}</li>
      </ul>
      <form action={upgrade}>
        <button className="approve-button" disabled={isCurrent} type="submit">
          {isCurrent ? "Current plan" : `Upgrade to ${tier}`}
        </button>
      </form>
    </section>
  );
}

export default async function BillingPage() {
  const testEmail = process.env.NODE_ENV !== "production" ? process.env.GITFUSE_TEST_DASHBOARD_EMAIL : undefined;
  const session = testEmail ? null : await auth();
  if (!testEmail && !session?.user) redirect("/login");

  const account = {
    email: testEmail ?? session?.user?.email,
    username: session?.user?.name
  };
  const billing = await getDashboardBilling(account, { fixturePath: process.env.GITFUSE_DASHBOARD_BILLING_FIXTURE });

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Subscription</p>
          <h1>Billing</h1>
        </div>
        <p>{billing.tier} tier</p>
      </header>

      <section className="repo-summary" aria-label="Billing summary">
        <div>
          <span>Current plan</span>
          <strong>{billing.tier}</strong>
        </div>
        <div>
          <span>Price</span>
          <strong>{tierPriceLabel(billing.tier)}</strong>
        </div>
        <div>
          <span>Renewal</span>
          <strong>{formatDate(billing.currentPeriodEnd)}</strong>
        </div>
        <div>
          <span>Invoices</span>
          <strong>{billing.invoices.length}</strong>
        </div>
      </section>

      <section className="billing-grid" aria-label="Upgrade plans">
        <PlanCard tier="pro" currentTier={billing.tier} account={account} />
        <PlanCard tier="team" currentTier={billing.tier} account={account} />
      </section>

      <section className="billing-invoices" aria-label="Invoices">
        <h2>Invoices</h2>
        {billing.invoices.length === 0 ? (
          <p>No invoices yet.</p>
        ) : (
          <div className="repo-table-wrap">
            <table className="repo-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {billing.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{formatDate(invoice.createdAt)}</td>
                    <td>{formatMoney(invoice.amountPaid, invoice.currency)}</td>
                    <td>
                      {invoice.hostedInvoiceUrl ? <a href={invoice.hostedInvoiceUrl}>View invoice</a> : "Unavailable"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
