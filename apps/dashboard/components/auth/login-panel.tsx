"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Zap } from "lucide-react";

export function LoginPanel({ githubAction }: { githubAction?: () => Promise<void> }) {
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState("");

  function showComingSoon(type: "Email") {
    setToast(`${type} OTP sign-in is available on the new login screen.`);
    window.setTimeout(() => setToast(""), 3600);
  }

  function openOAuth(provider: "github" | "google") {
    window.open(`/api/auth/signin/${provider}?callbackUrl=/dashboard`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left Column */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-[#020814] p-12 text-white border-r border-surface-2">
        <div className="flex items-center gap-2 font-bold text-xl text-ocean-light">
          <Zap className="w-6 h-6 text-ocean fill-ocean" />
          gitfuse
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight mb-8">
            "Your commits, secure and private across every device."
          </h1>
          <ul className="space-y-4 text-text-2">
            {[
              "End-to-end encrypted bundles",
              "SHA-preserving replay",
              "Editor-agnostic workflow"
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-ocean" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-sm text-text-3">
          © {new Date().getFullYear()} GitFuse
        </div>
      </div>

      {/* Right Column */}
      <div className="flex flex-col justify-center items-center w-full lg:w-[55%] p-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
            <h2 className="text-[24px] font-bold text-text mb-2">Sign in to gitfuse</h2>
            <p className="text-text-3">Manage your sync workspace</p>
          </div>

          <button
            className="flex items-center justify-center gap-3 w-full bg-[#0F172A] hover:bg-[#1E293B] text-white font-medium py-2.5 px-4 rounded-lg transition-colors mb-4 disabled:opacity-50"
            onClick={() => {
              if (githubAction) void githubAction();
              else openOAuth("github");
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
              <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .1.8 2.1 3.4 1.5.1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.1 5.9 18 6.2 18 6.2c.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v2.6c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z" />
            </svg>
            Continue with GitHub
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-surface-2"></div>
            <span className="text-sm text-text-3">or</span>
            <div className="flex-1 h-px bg-surface-2"></div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-2 mb-1.5">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full bg-surface border border-surface-2 rounded-lg px-3 py-2 text-text placeholder:text-text-3 focus:outline-none focus:border-ocean transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-2 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="w-full bg-surface border border-surface-2 rounded-lg pl-3 pr-10 py-2 text-text placeholder:text-text-3 focus:outline-none focus:border-ocean transition-colors"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-text-2">
                <input type="checkbox" className="rounded border-surface-2 bg-surface text-ocean focus:ring-ocean accent-ocean" />
                Remember me
              </label>
              <Link href="#" className="text-ocean hover:text-ocean-light">Forgot password?</Link>
            </div>

            <button
              type="button"
              onClick={() => showComingSoon("Email")}
              className="w-full bg-ocean/50 text-white/70 font-medium py-2.5 px-4 rounded-lg cursor-not-allowed border border-ocean/20 mt-2"
            >
              Sign in with email
            </button>

            <div className="gf-css-tooltip w-full" data-tooltip="Open Google OAuth in a new tab">
              <button
                type="button"
                onClick={() => openOAuth("google")}
                className="w-full bg-transparent border border-surface-2 text-text-2 hover:bg-surface font-medium py-2.5 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <span className="font-bold text-lg">G</span>
                Continue with Google
              </button>
            </div>
          </div>

          <p className="text-center text-sm text-text-3 mt-8">
            Don't have an account? <Link href="#" className="text-ocean hover:text-ocean-light">Sign up</Link>
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-lg shadow-xl border border-surface-2 font-medium z-50 animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
