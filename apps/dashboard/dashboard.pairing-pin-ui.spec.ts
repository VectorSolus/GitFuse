import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  closedPairingPinRevealState,
  PAIRING_PIN_REVEAL_TIMEOUT_MS,
} from "./lib/pairing-pin-reveal-state";
import {
  PAIRING_PIN_ONBOARDING_SKIP_KEY,
  resolvePairingPinOnboardingStep,
  skippedPairingPinOnboardingStep,
} from "./lib/pairing-pin-onboarding-state";

const settingsSource = readFileSync(
  new URL("./app/(dashboard)/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);
const onboardingSource = readFileSync(
  new URL(
    "./app/(dashboard)/components/layout/pairing-pin-onboarding.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("pairing PIN settings UI safety", () => {
  it("scrubs revealed PIN modal state and current PIN on every close path", () => {
    expect(PAIRING_PIN_REVEAL_TIMEOUT_MS).toBe(30_000);
    expect(closedPairingPinRevealState()).toEqual({
      revealOpen: false,
      revealOtp: "",
      revealedPin: "",
      revealFeedback: "",
      currentPin: "",
    });

    expect(settingsSource).toContain("closeRevealModal");
    expect(settingsSource).toContain("closedPairingPinRevealState()");
    expect(settingsSource).toContain("PAIRING_PIN_REVEAL_TIMEOUT_MS");
    expect(settingsSource).toContain("onClick={closeRevealModal}");
    expect(settingsSource).not.toContain("setCurrentPin(result.pin)");
  });

  it("keeps the revealed PIN visible only in the transient modal code element", () => {
    expect(settingsSource).toContain("<code>{revealedPin}</code>");
    expect(settingsSource).not.toContain("placeholder={revealedPin}");
    expect(settingsSource).not.toContain("value={revealedPin}");
    expect(settingsSource).not.toContain("localStorage");
    expect(settingsSource).not.toContain("sessionStorage");
  });

  it("labels browser-approved CLI auth separately from PIN-based pairing history", () => {
    expect(settingsSource).toContain("PIN-based device pairings");
    expect(settingsSource).toContain("No PIN-based pairings yet.");
    expect(settingsSource).toContain(
      "Devices approved through browser sign-in appear on the Devices page.",
    );
    expect(settingsSource).toContain('href="/dashboard/devices"');
    expect(settingsSource).toContain("View connected devices");
  });
});

describe("pairing PIN onboarding skip UI", () => {
  it("resolves skip without changing the server-backed PIN state", () => {
    expect(PAIRING_PIN_ONBOARDING_SKIP_KEY).toBe(
      "gitfuse:pairing-pin-onboarding-skipped",
    );
    expect(
      resolvePairingPinOnboardingStep({
        needsPairingPin: true,
        skippedInBrowser: false,
      }),
    ).toBe("pin");
    expect(
      resolvePairingPinOnboardingStep({
        needsPairingPin: true,
        skippedInBrowser: true,
      }),
    ).toBe("closed");
    expect(
      resolvePairingPinOnboardingStep({
        needsPairingPin: false,
        skippedInBrowser: true,
      }),
    ).toBe("closed");
    expect(skippedPairingPinOnboardingStep()).toBe("skipped");
  });

  it("wires Skip for now without calling setPairingPinAction", () => {
    const skipStart = onboardingSource.indexOf("function handleSkip()");
    const skipEnd = onboardingSource.indexOf("return (", skipStart);
    const skipHandler = onboardingSource.slice(skipStart, skipEnd);

    expect(skipStart).toBeGreaterThan(-1);
    expect(skipEnd).toBeGreaterThan(skipStart);
    expect(skipHandler).toContain("setStep(skippedPairingPinOnboardingStep())");
    expect(skipHandler).not.toContain("setPairingPinAction");
    expect(onboardingSource).toContain("Skip for now");
    expect(onboardingSource).toContain("You can set this later.");
    expect(onboardingSource).toContain("Open Security Settings");
    expect(onboardingSource).toContain('href="/dashboard/settings?section=security"');
  });
});
