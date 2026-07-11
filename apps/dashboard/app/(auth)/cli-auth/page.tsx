import { redirect } from "next/navigation";
import { auth, signIn } from "../../../lib/auth";
import {
  approveCliAuthSession,
  getCliAuthSessionStatus,
  type CliAuthSessionStatus,
} from "../../../lib/cli-auth";
import { CheckCircle2, Link2, Loader2, Terminal, WifiOff, XCircle, Zap } from "lucide-react";
import Link from "next/link";

type CliAuthPageProps = {
  searchParams: {
    code?: string;
    approved?: string;
  };
};

export default async function CliAuthPage({ searchParams }: CliAuthPageProps) {
  const code = (searchParams.code ?? "").trim().toUpperCase();
  const approved = searchParams.approved === "1";
  const session = await auth();
  const userName = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";
  const status = approved
    ? ({ state: "approved", approved: true } satisfies CliAuthSessionStatus)
    : await getCliAuthSessionStatus(code);
  const canApprove = Boolean(session?.user && code && status.state === "pending");

  return (
    <main className="min-h-screen bg-[#020814] flex flex-col items-center justify-center p-6 dark text-text relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(8,144,242,0.22),transparent_34%),linear-gradient(180deg,#020814_0%,#06152b_58%,#020814_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(ellipse_at_center,rgba(18,184,222,0.18),transparent_60%)] blur-2xl" />

      <div className="relative w-full max-w-xl bg-[#071426]/90 border border-[#123250] rounded-[2rem] p-8 shadow-[0_24px_90px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-52 w-80 -translate-x-1/2 rounded-full bg-[#12b8de]/20 blur-[80px] pointer-events-none" />

        <div className="relative z-10">
          <Link href="/" className="flex items-center justify-center gap-2 font-bold text-xl text-ocean-light mb-8 hover:opacity-80 transition-opacity">
            <Zap className="w-6 h-6 text-ocean fill-ocean" />
            gitfuse
          </Link>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-ocean/10 text-ocean rounded-full flex items-center justify-center mx-auto mb-4 border border-ocean/20 shadow-[0_0_25px_rgba(18,184,222,0.22)]">
              <StatusIcon status={status} />
            </div>
            <p className="text-xs uppercase tracking-[0.42em] text-ocean-light font-bold mb-3">
              CLI device auth
            </p>
            <h1 className="text-4xl font-black tracking-tight mb-3">
              {status.state === "approved" ? "Device approved." : "Approve this device."}
            </h1>
            <p className="text-text-3">
              {status.state === "approved"
                ? "Return to your terminal. gitfuse will finish storing the device credentials."
                : "A terminal is requesting access to your GitFuse account."}
            </p>
          </div>

          <div className="bg-[#020814]/80 border border-[#123250] rounded-2xl p-5 text-center mb-4">
            <div className="font-mono text-4xl tracking-[0.25em] font-bold text-ocean-light py-2">
              {code || "NO CODE"}
            </div>
          </div>

          <StatusMessage status={status} />

          <p className="text-center text-sm text-text-3 mb-8">
            {userName || email
              ? `Signed in as ${userName || email}`
              : "Sign in before approving this terminal session."}
          </p>

          <div className="space-y-3">
            {canApprove ? (
              <form
                action={async () => {
                  "use server";
                  await approveCliAuthSession({
                    code,
                    githubUsername: userName || email,
                    email
                  });
                  redirect(`/cli-auth?code=${encodeURIComponent(code)}&approved=1`);
                }}
              >
                <button className="w-full bg-ocean hover:bg-ocean-light text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 shadow-[0_0_10px_rgba(0,103,251,0.3)] hover:shadow-[0_0_20px_rgba(0,103,251,0.5)]" type="submit" disabled={!code}>
                  Approve device
                </button>
              </form>
            ) : null}

            {!session?.user && status.state === "pending" ? (
              <div className="space-y-3">
                <form
                  action={async () => {
                    "use server";
                    await signIn("github", { redirectTo: `/cli-auth?code=${encodeURIComponent(code)}` });
                  }}
                >
                  <button className="w-full flex items-center justify-center gap-3 bg-[#0F172A] hover:bg-[#1E293B] text-white font-medium py-3 px-4 rounded-xl transition-colors" type="submit">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .1.8 2.1 3.4 1.5.1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.1 5.9 18 6.2 18 6.2c.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v2.6c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z" />
                    </svg>
                    Approve with GitHub
                  </button>
                </form>

                <form
                  action={async () => {
                    "use server";
                    await signIn("google", { redirectTo: `/cli-auth?code=${encodeURIComponent(code)}` });
                  }}
                >
                  <button className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-950 font-medium py-3 px-4 rounded-xl transition-colors" type="submit">
                    Approve with Google
                  </button>
                </form>
              </div>
            ) : null}

            <Link href={status.state === "approved" ? "/dashboard" : "/login"} className="flex w-full items-center justify-center border border-surface-2 hover:bg-surface-2 text-text font-medium py-3 px-4 rounded-xl transition-colors">
              {status.state === "approved" ? "Open dashboard" : "Cancel"}
            </Link>
          </div>

          <p className="text-center text-xs text-text-3 mt-8">
            CLI auth codes expire after 10 minutes.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: CliAuthSessionStatus }) {
  if (status.state === "approved") {
    return <CheckCircle2 className="w-8 h-8" />;
  }
  if (status.state === "relay_unavailable") {
    return <WifiOff className="w-8 h-8" />;
  }
  if (status.state === "expired" || status.state === "missing_code" || status.state === "server_error") {
    return <XCircle className="w-8 h-8" />;
  }
  if (status.state === "pending") {
    return <Terminal className="w-8 h-8" />;
  }
  return <Loader2 className="w-8 h-8 animate-spin" />;
}

function StatusMessage({ status }: { status: CliAuthSessionStatus }) {
  const message = (() => {
    switch (status.state) {
      case "approved":
        return "Device approved. Return to your terminal.";
      case "pending":
        return "Code found. Review the terminal code, then approve this device.";
      case "expired":
        return "This code has expired. Run gitfuse auth login again.";
      case "relay_unavailable":
        return "Relay service is offline. Try again.";
      case "missing_code":
        return "No CLI auth code was provided.";
      case "server_error":
        return `Relay returned status ${status.status}. Try again.`;
    }
  })();

  return (
    <div className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-[#123250] bg-[#020814]/55 px-4 py-3 text-center text-sm text-text-3">
      <Link2 className="h-4 w-4 text-ocean-light" />
      <span>{message}</span>
    </div>
  );
}
