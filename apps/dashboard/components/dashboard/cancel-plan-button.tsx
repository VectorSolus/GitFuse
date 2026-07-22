"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DashboardBilling } from "@/lib/billing";

type CancelPlanButtonProps = {
  className?: string;
  label?: string;
  onCancelled?: (billing: DashboardBilling) => void;
  initialConfirmOpen?: boolean;
};

type CancelPlanResponse = {
  ok?: boolean;
  billing?: DashboardBilling;
  message?: string;
  error?: string;
};

export function CancelPlanButton({
  className,
  label = "Cancel plan",
  onCancelled,
  initialConfirmOpen = false,
}: CancelPlanButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(initialConfirmOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleCancelPlan() {
    if (pending) return;

    setPending(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as CancelPlanResponse;

      if (!response.ok || !payload.ok || !payload.billing) {
        throw new Error(
          payload.message ?? payload.error ?? "Could not cancel this plan.",
        );
      }

      setSuccessMessage(payload.message ?? "Plan cancelled.");
      onCancelled?.(payload.billing);
      router.refresh();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Could not cancel this plan.",
      );
    } finally {
      setPending(false);
    }
  }

  function closeDialog() {
    if (pending) return;
    setConfirmOpen(false);
    setError("");
    setSuccessMessage("");
  }

  return (
    <>
      <button
        type="button"
        className={className ?? "gf-cancel-plan-trigger"}
        onClick={() => setConfirmOpen(true)}
      >
        {label}
      </button>

      {confirmOpen ? (
        <div className="gf-cancel-plan-modal" role="dialog" aria-modal="true">
          <div className="gf-cancel-plan-backdrop" onClick={closeDialog} />

          <section className="gf-cancel-plan-card">
            <p className="gf-dash-eyebrow">Cancel plan</p>
            {successMessage ? (
              <>
                <h2>Plan cancelled.</h2>
                <span>{successMessage}</span>

                <div className="gf-cancel-plan-actions">
                  <button type="button" onClick={closeDialog}>
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Move this workspace back to Free?</h2>
                <span>
                  GitFuse will cancel the Razorpay subscription on the server
                  and refresh this workspace to Free limits after confirmation.
                </span>

                {error ? (
                  <p className="gf-cancel-plan-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="gf-cancel-plan-actions">
                  <button type="button" onClick={closeDialog} disabled={pending}>
                    Keep plan
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelPlan}
                    disabled={pending}
                  >
                    {pending ? "Cancelling..." : "Cancel plan"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
