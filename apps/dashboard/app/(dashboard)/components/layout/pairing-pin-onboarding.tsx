"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { setPairingPinAction } from "@/app/(dashboard)/dashboard/settings/actions";
import {
  PAIRING_PIN_ONBOARDING_SKIP_KEY,
  resolvePairingPinOnboardingStep,
  skippedPairingPinOnboardingStep,
  type PairingPinOnboardingStep,
} from "@/lib/pairing-pin-onboarding-state";

type PairingPinOnboardingProps = {
  needsPairingPin: boolean;
};

type FieldErrors = {
  pin?: string;
  confirmPin?: string;
  form?: string;
};

export function PairingPinOnboarding({
  needsPairingPin,
}: PairingPinOnboardingProps) {
  const [step, setStep] = useState<PairingPinOnboardingStep>(
    needsPairingPin ? "checking" : "closed",
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [visible, setVisible] = useState({ pin: false, confirmPin: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!needsPairingPin) {
      try {
        window.localStorage.removeItem(PAIRING_PIN_ONBOARDING_SKIP_KEY);
      } catch {
        // Ignore storage restrictions; account state still controls the PIN tile.
      }
      setStep("closed");
      return;
    }

    let skippedInBrowser = false;
    try {
      skippedInBrowser =
        window.localStorage.getItem(PAIRING_PIN_ONBOARDING_SKIP_KEY) === "1";
    } catch {
      skippedInBrowser = false;
    }

    setStep(
      resolvePairingPinOnboardingStep({
        needsPairingPin,
        skippedInBrowser,
      }),
    );
  }, [needsPairingPin]);

  if (step === "closed" || step === "checking") return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextErrors = validatePairingPin(pin, confirmPin);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    try {
      const result = await setPairingPinAction({ pin });
      if (!result.ok) {
        throw new Error(result.error ?? "Could not save your pairing PIN.");
      }

      setPin("");
      setConfirmPin("");
      setErrors({});
      try {
        window.localStorage.removeItem(PAIRING_PIN_ONBOARDING_SKIP_KEY);
      } catch {
        // Ignore storage restrictions; the saved account state closes onboarding.
      }
      setStep("saved");
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Could not save your pairing PIN.",
      });
    } finally {
      setPending(false);
    }
  }

  function handleSkip() {
    setPin("");
    setConfirmPin("");
    setErrors({});
    setPending(false);
    try {
      window.localStorage.setItem(PAIRING_PIN_ONBOARDING_SKIP_KEY, "1");
    } catch {
      // Ignore storage restrictions; this still skips for the current render.
    }
    setStep(skippedPairingPinOnboardingStep());
  }

  return (
    <div className="gf-pin-onboarding-modal" role="dialog" aria-modal="true">
      <div className="gf-pin-onboarding-backdrop" />

      {step === "pin" ? (
        <form className="gf-pin-onboarding-card" onSubmit={handleSubmit}>
          <p className="gf-dash-eyebrow">Device pairing PIN</p>
          <h2>Set your pairing PIN.</h2>
          <span>
            This PIN enables PIN-based CLI device pairing when you use the PIN challenge.
          </span>

          <SecretInput
            label="Pairing PIN"
            value={pin}
            visible={visible.pin}
            error={errors.pin}
            autoComplete="new-password"
            autoFocus
            onChange={(value) => {
              setPin(value);
              setErrors((current) => ({ ...current, pin: undefined, form: undefined }));
            }}
            onToggle={() =>
              setVisible((current) => ({ ...current, pin: !current.pin }))
            }
          />

          <SecretInput
            label="Confirm pairing PIN"
            value={confirmPin}
            visible={visible.confirmPin}
            error={errors.confirmPin}
            autoComplete="new-password"
            onChange={(value) => {
              setConfirmPin(value);
              setErrors((current) => ({
                ...current,
                confirmPin: undefined,
                form: undefined,
              }));
            }}
            onToggle={() =>
              setVisible((current) => ({
                ...current,
                confirmPin: !current.confirmPin,
              }))
            }
          />

          {errors.form ? (
            <p className="gf-pin-onboarding-error" role="alert">
              {errors.form}
            </p>
          ) : null}

          <button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save pairing PIN"}
          </button>

          <button
            type="button"
            className="gf-pin-onboarding-skip"
            onClick={handleSkip}
            disabled={pending}
          >
            Skip for now
          </button>
        </form>
      ) : step === "saved" ? (
        <section className="gf-pin-onboarding-card gf-pin-onboarding-success">
          <p className="gf-dash-eyebrow">Pairing PIN saved</p>
          <h2>You are ready to pair devices.</h2>
          <span>
            Your pairing PIN can be managed from Account Settings &gt; Security.
          </span>

          <div className="gf-pin-onboarding-actions">
            <Link
              href="/dashboard/settings?section=security"
              onClick={() => setStep("closed")}
            >
              Go to account settings &gt;
            </Link>

            <button type="button" onClick={() => setStep("closed")}>
              Continue to dashboard
            </button>
          </div>
        </section>
      ) : (
        <section className="gf-pin-onboarding-card gf-pin-onboarding-success">
          <p className="gf-dash-eyebrow">Device pairing PIN</p>
          <h2>You can set this later.</h2>
          <span>
            Set a pairing PIN from Settings &gt; Security when you want PIN-based CLI device pairing.
          </span>

          <div className="gf-pin-onboarding-actions">
            <Link
              href="/dashboard/settings?section=security"
              onClick={() => setStep("closed")}
            >
              Open Security Settings
            </Link>

            <button type="button" onClick={() => setStep("closed")}>
              Continue to dashboard
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SecretInput({
  label,
  value,
  visible,
  error,
  autoComplete,
  autoFocus = false,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  autoComplete: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="gf-pin-onboarding-field">
      <span>{label}</span>
      <div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          minLength={8}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          title={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error ? <em>{error}</em> : null}
    </label>
  );
}

function validatePairingPin(pin: string, confirmPin: string) {
  const errors: FieldErrors = {};
  if (!pin) {
    errors.pin = "Pairing PIN is required.";
  } else if (pin.length < 8) {
    errors.pin = "Use at least 8 characters.";
  } else if (!/[A-Za-z]/.test(pin) || !/\d/.test(pin)) {
    errors.pin = "Add at least one letter and one number.";
  }

  if (!confirmPin) {
    errors.confirmPin = "Confirm pairing PIN is required.";
  } else if (pin && pin !== confirmPin) {
    errors.confirmPin = "PIN confirmation does not match.";
  }

  return errors;
}
