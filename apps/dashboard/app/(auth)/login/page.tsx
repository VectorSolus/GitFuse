import { redirect } from "next/navigation";

import { auth, signIn } from "../../../lib/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">gitfuse dashboard</p>
        <h1>Sign in with GitHub</h1>
        <p className="copy">Manage relay entries, devices, usage, and billing for encrypted committed-git sync.</p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button type="submit">Continue with GitHub</button>
        </form>
      </section>
    </main>
  );
}
