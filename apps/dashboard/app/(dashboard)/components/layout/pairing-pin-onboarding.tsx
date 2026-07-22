"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { setPairingPinAction } from "@/app/(dashboard)/dashboard/settings/actions";

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
  const [step, setStep] = useState<"pin" | "saved" | "closed">(
    needsPairingPin ? "pin" : "closed",
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [visible, setVisible] = useState({ pin: false, confirmPin: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  if (step === "closed") return null;

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

  return (
    <div className="gf-pin-onboarding-modal" role="dialog" aria-modal="true">
      <div className="gf-pin-onboarding-backdrop" />

      {step === "pin" ? (
        <form className="gf-pin-onboarding-card" onSubmit={handleSubmit}>
          <p className="gf-dash-eyebrow">Device pairing PIN</p>
          <h2>Set your pairing PIN.</h2>
          <span>
            This PIN links new CLI devices to your GitFuse account after sign-in.
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
        </form>
      ) : (
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
