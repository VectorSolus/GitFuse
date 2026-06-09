import { redirect } from "next/navigation";

import { auth, signIn } from "../../../lib/auth";
import { approveCliAuthSession } from "../../../lib/cli-auth";

type CliAuthPageProps = {
  searchParams: {
    code?: string;
  };
};

export default async function CliAuthPage({ searchParams }: CliAuthPageProps) {
  const code = (searchParams.code ?? "").trim().toUpperCase();
  const session = await auth();
  const userName = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  return (
    <main className="cli-auth-page">
      <section className="cli-auth-panel">
        <p className="eyebrow">device approval</p>
        <h1>Approve gitfuse CLI</h1>
        <p className="copy">
          Confirm this one-time code to connect the CLI on another device to your gitfuse account.
        </p>

        <div className="code-display" aria-label="CLI auth code">
          {code || "NO CODE"}
        </div>

        {session?.user ? (
          <form
            action={async () => {
              "use server";
              await approveCliAuthSession({
                code,
                githubUsername: userName || email,
                email
              });
              redirect("/dashboard");
            }}
          >
            <button className="approve-button" type="submit" disabled={!code}>
              Approve
            </button>
          </form>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: `/cli-auth?code=${encodeURIComponent(code)}` });
            }}
          >
            <button className="approve-button" type="submit">
              Approve
            </button>
            <p className="auth-note">Sign in with GitHub to complete approval.</p>
          </form>
        )}
      </section>
    </main>
  );
}
