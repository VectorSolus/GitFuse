import {
  findDashboardAccountByEmail,
  markDashboardAccountEmailVerified,
  setDashboardAccountPassword,
  upsertDashboardAccount,
  type DashboardAccount,
} from "./account";
import {
  createOtp,
  isValidEmail,
  normalizeEmail,
  sendOtpEmail,
  verifyOtpChallenge,
  type OtpPurpose,
} from "./otp";
import { hashPassword, isValidPassword, verifyPassword } from "./password";

export type EmailOtpRequestResult =
  | { ok: true; next: "otp_required"; sent: true; expiresAt: string }
  | { ok: true; next: "password_signin_available" }
  | { ok: false; error: "INVALID_EMAIL" | "PASSWORD_TOO_SHORT" | "EMAIL_DELIVERY_FAILED" };

type SendOtp = (email: string, code: string, purpose: OtpPurpose) => Promise<void>;

export async function requestEmailPasswordOtp(input: {
  email: string;
  password: string;
  sendOtp?: SendOtp;
}): Promise<EmailOtpRequestResult> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!isValidEmail(email)) return { ok: false, error: "INVALID_EMAIL" };
  if (!isValidPassword(password)) return { ok: false, error: "PASSWORD_TOO_SHORT" };

  const existingUser = await findDashboardAccountByEmail(email);

  if (existingUser?.password_hash && existingUser.email_verified_at) {
    return { ok: true, next: "password_signin_available" };
  }

  const passwordHash = await hashPassword(password);
  const user =
    existingUser
      ? await setDashboardAccountPassword(existingUser.id, passwordHash)
      : (
          await upsertDashboardAccount({
            provider: "email",
            providerAccountId: email,
            username: email.split("@")[0],
            email,
            passwordHash,
          })
        ).user;

  if (!user) return { ok: false, error: "EMAIL_DELIVERY_FAILED" };

  const code = await createOtp(user.id, email, "sign_in_email");

  try {
    await (input.sendOtp ?? sendOtpEmail)(email, code, "sign_in_email");
  } catch (error) {
    console.error("[email-password-otp]", error);
    return { ok: false, error: "EMAIL_DELIVERY_FAILED" };
  }

  return {
    ok: true,
    next: "otp_required",
    sent: true,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export async function authorizeEmailPassword(input: {
  email: string;
  password: string;
  otp?: string;
}): Promise<DashboardAccount | null> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const otp = input.otp?.trim() ?? "";

  const existingUser = await findDashboardAccountByEmail(email);

  if (password && !otp) {
    if (
      !existingUser?.email_verified_at ||
      !existingUser.password_hash ||
      !(await verifyPassword(password, existingUser.password_hash))
    ) {
      return null;
    }

    return existingUser;
  }

  if (!otp || !isValidPassword(password)) return null;

  const verification = await verifyOtpChallenge(email, otp);
  if (!verification.ok) return null;

  if (existingUser) {
    if (
      existingUser.password_hash &&
      !(await verifyPassword(password, existingUser.password_hash))
    ) {
      return null;
    }

    if (!existingUser.password_hash) {
      const withPassword = await setDashboardAccountPassword(
        existingUser.id,
        await hashPassword(password),
      );
      if (!withPassword) return null;
    }

    return markDashboardAccountEmailVerified(existingUser.id);
  }

  const { user } = await upsertDashboardAccount({
    provider: "email",
    providerAccountId: email,
    username: email.split("@")[0],
    email,
    emailVerifiedAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
  });

  return user;
}
