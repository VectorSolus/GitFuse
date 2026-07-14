import { getSql } from "../lib/db";

const providers = ["github", "google"];
const providerPatterns = providers.map((provider) => `${provider}:%`);

const sql = getSql();

const updated = await sql<{ provider: string; count: number | string }[]>`
  with updated_users as (
    update users
    set email_verified_at = now(),
        updated_at = now()
    where email_verified_at is null
      and (
        github_id like ${providerPatterns[0]}
        or github_id like ${providerPatterns[1]}
      )
    returning split_part(github_id, ':', 1) as provider
  )
  select provider, count(*)::int as count
  from updated_users
  group by provider
  order by provider
`;

const summary = Object.fromEntries(
  providers.map((provider) => [
    provider,
    Number(updated.find((row) => row.provider === provider)?.count ?? 0),
  ]),
);

console.log(JSON.stringify({ updated: summary }));

await sql.end();
