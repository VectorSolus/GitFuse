"use server";

import { auth } from "@/lib/auth";
import { findDashboardAccountForSession } from "@/lib/account";
import { getSql } from "@/lib/db";
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

    const userEmail = normalizeEmail(user.email);

    const verified = await verifyOtp(
      user.id,
      userEmail,
      input.otpCode,
      "delete_account",
    );

    if (!verified) {
      return {
        ok: false,
        error: "Incorrect verification code.",
      };
    }

    const sql = getSql();
    await sql.begin(async (transaction) => {
      const [lockedUser] = await transaction<{
        id: string;
        email: string;
      }[]>`
        select id, email
        from users
        where id = ${user.id}
        for update
      `;

      if (!lockedUser) {
        throw new Error("Authenticated user no longer exists.");
      }

      const normalizedEmail = normalizeEmail(lockedUser.email);

      await transaction`
        update bundles
        set parent_bundle_id = null
        where repository_id in (
          select id from repositories where user_id = ${lockedUser.id}
        )
      `;

      await transaction`
        delete from email_verification_otps
        where email = ${normalizedEmail}
           or user_id = ${lockedUser.id}
      `;

      await transaction`
        delete from users
        where id = ${lockedUser.id}
      `;
    });

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
