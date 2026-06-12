"use server";

import { auth } from "@/lib/auth";
import { getSql } from "@/lib/db";

type DeleteCurrentAccountResult = {
  ok: boolean;
  error?: string;
  redirectTo?: string;
};

export async function deleteCurrentAccountAction(input: {
  confirmationEmail: string;
}): Promise<DeleteCurrentAccountResult> {
  const session = await auth().catch(() => null);

  if (!session?.user?.email) {
    return {
      ok: false,
      error: "You must be signed in to delete your account.",
    };
  }

  const confirmationEmail = input.confirmationEmail.trim().toLowerCase();
  const sessionEmail = session.user.email.trim().toLowerCase();

  try {
    const sql = getSql();
    const [user] = await sql<{ id: string; email: string }[]>`
      select id, email
      from users
      where email = ${session.user.email}
         or (${session.user.name ?? null}::text is not null and github_username = ${session.user.name ?? null})
      order by updated_at desc
      limit 1
    `;

    if (!user) {
      return {
        ok: false,
        error: "Could not delete account. Please try again.",
      };
    }

    const userEmail = user.email.trim().toLowerCase();

    if (confirmationEmail !== userEmail || confirmationEmail !== sessionEmail) {
      return {
        ok: false,
        error: "Email confirmation does not match this account.",
      };
    }

    await sql.begin(async (transaction) => {
      await transaction`
        update bundles
        set parent_bundle_id = null
        where repository_id in (
          select id from repositories where user_id = ${user.id}
        )
      `;

      await transaction`
        delete from email_verification_otps
        where email = ${user.email}
           or user_id = ${user.id}
      `;

      await transaction`
        delete from users
        where id = ${user.id}
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
