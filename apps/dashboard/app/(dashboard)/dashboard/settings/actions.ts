"use server";

import { auth } from "@/lib/auth";
import { deleteDashboardAccountWithOtp } from "@/lib/account-delete";
import {
  findDashboardAccountForSession,
  updateDashboardAccountProfile,
} from "@/lib/account";
import { getSql } from "@/lib/db";
import {
  requestPairingPinRevealOtp,
  revealPairingPinWithOtp,
  setPairingPin,
} from "@/lib/pairing-pin";
import {
  createOtp,
  isValidEmail,
  isOtpCooldownActive,
  normalizeEmail,
  sendOtpEmail,
  verifyOtp,
} from "@/lib/otp";

type ActionResult = {
  ok: boolean;
  error?: string;
  email?: string;
  displayName?: string;
};

type DeleteCurrentAccountResult = ActionResult & {
  redirectTo?: string;
};

type CurrentUser = {
  id: string;
  email: string;
};

async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth().catch(() => null);
  if (!session?.user || session.invalid) return null;

  const user = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  });

  return user
    ? {
        id: user.id,
        email: user.email,
      }
    : null;
}

export async function requestEmailOtp(email: string): Promise<ActionResult> {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to add an email." };
    }

    if (normalizeEmail(user.email) === normalizedEmail) {
      return { ok: false, error: "This email is already connected." };
    }

    const code = await createOtp(user.id, normalizedEmail, "add_email");
    await sendOtpEmail(normalizedEmail, code, "add_email");
    return { ok: true };
  } catch (error) {
    console.error("[add-email]", error);
    return { ok: false, error: "Could not send verification code." };
  }
}

export async function updateProfileAction(input: {
  displayName: string;
}): Promise<ActionResult> {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");

  if (!displayName) {
    return { ok: false, error: "Enter a display name." };
  }

  if (displayName.length > 80) {
    return { ok: false, error: "Display name must be 80 characters or fewer." };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to update your profile.",
      };
    }

    const updated = await updateDashboardAccountProfile({
      userId: user.id,
      displayName,
    });

    if (!updated) {
      return { ok: false, error: "Could not update your profile." };
    }

    return { ok: true, displayName: updated.display_name };
  } catch (error) {
    console.error("[profile-settings]", error);
    return { ok: false, error: "Could not update your profile." };
  }
}

export async function verifyEmailOtp(
  email: string,
  code: string,
): Promise<ActionResult> {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to add an email." };
    }

    const verified = await verifyOtp(
      user.id,
      normalizedEmail,
      code,
      "add_email",
    );

    if (!verified) {
      return {
        ok: false,
        error: "Verification code is invalid or expired.",
      };
    }

    const sql = getSql();
    await sql`
      update users
      set email = ${normalizedEmail},
          email_verified_at = now(),
          updated_at = now()
      where id = ${user.id}
    `;

    return { ok: true };
  } catch (error) {
    console.error("[add-email]", error);
    return { ok: false, error: "Could not verify this email." };
  }
}

export async function requestDeleteAccountOtp(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to delete your account.",
      };
    }

    const email = normalizeEmail(user.email);
    if (!email || !isValidEmail(email)) {
      return {
        ok: false,
        error: "No account email is available for verification.",
      };
    }

    if (
      await isOtpCooldownActive(user.id, email, "delete_account")
    ) {
      return {
        ok: false,
        error: "Please wait before requesting another code.",
      };
    }

    const code = await createOtp(user.id, email, "delete_account");
    await sendOtpEmail(email, code, "delete_account");
    return { ok: true, email };
  } catch (error) {
    console.error("[delete-account]", error);
    return { ok: false, error: "Could not send verification code." };
  }
}

export async function setPairingPinAction(input: {
  pin: string;
  currentPin?: string;
}): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to manage your pairing PIN.",
      };
    }

    const result = await setPairingPin(user.id, input.pin, {
      currentPin: input.currentPin,
    });
    if (!result.ok) {
      console.error("[pairing-pin-settings]", result.error);
      return { ok: false, error: "Could not update your pairing PIN." };
    }

    return { ok: true };
  } catch (error) {
    console.error("[pairing-pin-settings]", error);
    return { ok: false, error: "Could not update your pairing PIN." };
  }
}

export async function requestPairingPinRevealOtpAction(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to reveal your pairing PIN.",
      };
    }

    const result = await requestPairingPinRevealOtp({
      userId: user.id,
      email: user.email,
    });

    if (!result.ok) {
      return { ok: false, error: "No pairing PIN is currently set." };
    }

    return { ok: true, email: user.email };
  } catch (error) {
    console.error("[pairing-pin-reveal]", error);
    return { ok: false, error: "Could not send a reveal code." };
  }
}

export async function revealPairingPinAction(otpCode: string): Promise<ActionResult & { pin?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to reveal your pairing PIN.",
      };
    }

    const result = await revealPairingPinWithOtp({
      userId: user.id,
      email: user.email,
      otpCode,
    });

    if (!result.ok) {
      return {
        ok: false,
        error:
          result.error === "invalid_otp"
            ? "Verification code is invalid or expired."
            : "Could not reveal your pairing PIN.",
      };
    }

    return { ok: true, pin: result.pin };
  } catch (error) {
    console.error("[pairing-pin-reveal]", error);
    return { ok: false, error: "Could not reveal your pairing PIN." };
  }
}

export async function deleteCurrentAccountAction(input: {
  otpCode: string;
}): Promise<DeleteCurrentAccountResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: "You must be signed in to delete your account.",
      };
    }

    const result = await deleteDashboardAccountWithOtp({
      userId: user.id,
      otpCode: input.otpCode,
    });

    if (!result.ok && result.error === "INVALID_OTP") {
      return {
        ok: false,
        error: "Incorrect verification code.",
      };
    }

    if (!result.ok) {
      return {
        ok: false,
        error: "Could not delete account. Please try again.",
      };
    }

    return {
      ok: true,
      redirectTo: "/",
    };
  } catch (error) {
    console.error("[delete-account]", error);

    return {
      ok: false,
      error: "Could not delete account. Please try again.",
    };
  }
}
