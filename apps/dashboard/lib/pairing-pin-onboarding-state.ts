export const PAIRING_PIN_ONBOARDING_SKIP_KEY =
  "gitfuse:pairing-pin-onboarding-skipped";

export type PairingPinOnboardingStep =
  | "checking"
  | "pin"
  | "saved"
  | "skipped"
  | "closed";

export function resolvePairingPinOnboardingStep(input: {
  needsPairingPin: boolean;
  skippedInBrowser: boolean;
}): PairingPinOnboardingStep {
  if (!input.needsPairingPin) return "closed";
  if (input.skippedInBrowser) return "closed";
  return "pin";
}

export function skippedPairingPinOnboardingStep(): PairingPinOnboardingStep {
  return "skipped";
}
