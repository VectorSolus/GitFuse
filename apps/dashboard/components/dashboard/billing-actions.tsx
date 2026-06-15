"use client";

import { useState, useTransition } from "react";

export function BillingUpgradeButton({ tier, disabled }: { tier: "pro" | "team"; disabled?: boolean }) {
  const [toast, setToast] = useState("");
  const [pending, startTransition] = useTransition();

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4200);
  }

  function startCheckout() {
    startTransition(() => {
      notify(`Opening Razorpay plans for ${tier === "pro" ? "Pro" : "Team"}.`);
      window.location.assign("/dashboard/upgrade");
    });
  }

  return (
    <>
      <button className="gf-primary-button" disabled={disabled || pending} type="button" onClick={startCheckout}>
        {disabled ? "Current plan" : pending ? "Opening..." : `Upgrade to ${tier === "pro" ? "Pro" : "Team"}`}
      </button>
      {toast ? <div className="gf-toast">{toast}</div> : null}
    </>
  );
}
