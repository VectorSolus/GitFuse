import { getSql } from "./db";

type DashboardAccountInput = {
  githubId: string;
  githubUsername: string;
  email: string;
};

export async function upsertDashboardAccount(input: DashboardAccountInput) {
  const sql = getSql();
  const [user] = await sql<{ id: string; github_username: string; email: string }[]>`
    insert into users (github_id, github_username, email)
    values (${input.githubId}, ${input.githubUsername}, ${input.email})
    on conflict (github_id)
    do update set
      github_username = excluded.github_username,
      email = excluded.email,
      updated_at = now()
    returning id, github_username, email
  `;

  await sql`
    insert into plans (user_id, tier, team_seat_count)
    values (${user.id}, 'free', 1)
    on conflict (user_id) do nothing
  `;

  const [plan] = await sql<{ tier: "free" | "pro" | "team" | "enterprise" }[]>`
    select tier from plans where user_id = ${user.id} limit 1
  `;

  return { user, plan };
}
