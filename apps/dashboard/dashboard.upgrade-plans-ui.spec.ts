import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const upgradePageSource = readFileSync(
  new URL("./app/(dashboard)/dashboard/upgrade/page.tsx", import.meta.url),
  "utf8",
);
const dashboardLayoutSource = readFileSync(
  new URL(
    "./app/(dashboard)/components/layout/dashboard-layout.tsx",
    import.meta.url,
  ),
  "utf8",
);
const upgradePlansLabel = ["Upgrade", "plans"].join(" ");
const legacyPlansLabel = ["Early access", "plans"].join(" ");

describe("upgrade plan production copy", () => {
  it("uses the new label in the page and account navigation", () => {
    expect(upgradePageSource).toContain(
      `<p className="gf-dash-eyebrow">${upgradePlansLabel}</p>`,
    );
    expect(dashboardLayoutSource).toContain(
      `"/dashboard/upgrade": "${upgradePlansLabel}"`,
    );
    expect(dashboardLayoutSource).toContain(
      `<span>${upgradePlansLabel}</span>`,
    );
  });

  it("removes the legacy plan label from dashboard UI", () => {
    expect(
      `${upgradePageSource}\n${dashboardLayoutSource}`.toLowerCase(),
    ).not.toContain(legacyPlansLabel.toLowerCase());
  });

  it("keeps paid plans Coming Soon without the Razorpay status tile", () => {
    expect(upgradePageSource).toContain(
      "Free is available. Paid plans are Coming Soon.",
    );
    expect(upgradePageSource).toContain("!PAID_BILLING_ENABLED");
    expect(upgradePageSource).not.toContain("gf-upgrade-note-card");
    expect(upgradePageSource).not.toContain("Existing Razorpay routes");
  });
});
