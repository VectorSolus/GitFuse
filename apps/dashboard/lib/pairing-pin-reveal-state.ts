export const PAIRING_PIN_REVEAL_TIMEOUT_MS = 30_000;

export type PairingPinRevealClosedState = {
  revealOpen: false;
  revealOtp: "";
  revealedPin: "";
  revealFeedback: "";
  currentPin: "";
};

export function closedPairingPinRevealState(): PairingPinRevealClosedState {
  return {
    revealOpen: false,
    revealOtp: "",
    revealedPin: "",
    revealFeedback: "",
    currentPin: "",
  };
}
