"use client";

import { EARLY_ACCESS_COPY } from "@/lib/launch-mode";

export function BillingUpgradeButton({
  tier,
  disabled,
}: {
  tier: "pro" | "team";
  disabled?: boolean;
}) {
  const planName = tier === "pro" ? "Pro" : "Team";

  return (
    <button className="gf-primary-button" disabled type="button">
      {disabled
        ? "Current plan"
        : `${planName} ${EARLY_ACCESS_COPY.paidAvailability}`}
    </button>
  );
}
