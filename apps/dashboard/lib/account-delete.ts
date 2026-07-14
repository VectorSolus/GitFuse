import { getSql } from "./db";
import { normalizeEmail, verifyOtp } from "./otp";

export type DeleteDashboardAccountResult =
  | { ok: true; email: string }
  | { ok: false; error: "ACCOUNT_NOT_FOUND" | "INVALID_OTP" };

export async function deleteDashboardAccountWithOtp(input: {
  userId: string;
  otpCode: string;
}): Promise<DeleteDashboardAccountResult> {
  const sql = getSql();

  const [user] = await sql<{ id: string; email: string }[]>`
    select id, email
    from users
    where id = ${input.userId}
    limit 1
  `;

  if (!user) return { ok: false, error: "ACCOUNT_NOT_FOUND" };

  const normalizedEmail = normalizeEmail(user.email);
  const verified = await verifyOtp(
    user.id,
    normalizedEmail,
    input.otpCode,
    "delete_account",
  );

  if (!verified) return { ok: false, error: "INVALID_OTP" };

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

    const lockedEmail = normalizeEmail(lockedUser.email);

    await transaction`
      update bundles
      set parent_bundle_id = null
      where repository_id in (
        select id from repositories where user_id = ${lockedUser.id}
      )
    `;

    await transaction`
      delete from sync_event_commits
      where repository_id in (
        select id from repositories where user_id = ${lockedUser.id}
      )
    `;

    await transaction`
      delete from sync_events
      where repository_id in (
        select id from repositories where user_id = ${lockedUser.id}
      )
         or device_id in (
          select id from devices where user_id = ${lockedUser.id}
        )
    `;

    await transaction`
      delete from bundles
      where repository_id in (
        select id from repositories where user_id = ${lockedUser.id}
      )
         or device_id in (
          select id from devices where user_id = ${lockedUser.id}
        )
    `;

    await transaction`
      delete from repositories
      where user_id = ${lockedUser.id}
    `;

    await transaction`
      delete from devices
      where user_id = ${lockedUser.id}
    `;

    await transaction`
      delete from cli_auth_sessions
      where user_id = ${lockedUser.id}
    `;

    await transaction`
      delete from plans
      where user_id = ${lockedUser.id}
    `;

    await transaction`
      delete from email_verification_otps
      where email = ${lockedEmail}
         or user_id = ${lockedUser.id}
    `;

    await transaction`
      delete from users
      where id = ${lockedUser.id}
    `;
  });

  return { ok: true, email: normalizedEmail };
}
