import Link from "next/link";

export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-[#020814] flex items-center justify-center p-6 text-text">
      <section className="w-full max-w-md rounded-2xl border border-[#123250] bg-[#071426] p-8 text-center">
        <p className="text-xs uppercase tracking-[0.32em] text-ocean-light font-bold mb-3">
          Verification required
        </p>
        <h1 className="text-3xl font-black tracking-tight mb-3">
          Verify your email.
        </h1>
        <p className="text-text-3 mb-6">
          We need to confirm this email before opening the dashboard.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-xl bg-ocean px-4 py-3 font-medium text-white transition-colors hover:bg-ocean-light"
        >
          Continue verification
        </Link>
      </section>
    </main>
  );
}
