"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ClipboardEvent,
  ComponentType,
  FormEvent,
  KeyboardEvent,
} from "react";

const SoftAurora = dynamic(() => import("@/components/effects/SoftAurora"), {
  ssr: false,
}) as ComponentType<any>;

type LoginStep = "email" | "password" | "otp";
type OAuthProvider = "google" | "github";
type AccountStatus = {
  exists: boolean;
  hasPassword: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState(Array<string>(6).fill(""));
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(
    null,
  );
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromHome = params.get("email");
    const authError = params.get("error");

    if (authError) {
      setFeedback("Your previous session expired. Please sign in again.");
    }

    if (emailFromHome) {
      const decodedEmail = emailFromHome.trim();

      if (decodedEmail) {
        setEmail(decodedEmail);
        void loadAccountStatus(decodedEmail)
          .then((status) => {
            setAccountStatus(status);
            setStep("password");
          })
          .catch(() => {
            setFeedback("Could not check this account. Please try again.");
          });
      }
    }
  }, []);

  useEffect(() => {
    if (step !== "otp") return;
    otpInputRefs.current[0]?.focus();
  }, [step]);

  const maskedEmail = useMemo(() => {
    const [name, domain] = email.split("@");

    if (!name || !domain) return email;

    const visibleName =
      name.length <= 2 ? name : `${name.slice(0, 2)}${"*".repeat(4)}`;

    return `${visibleName}@${domain}`;
  }, [email]);

  async function openOAuth(provider: OAuthProvider) {
    setFeedback("");

    try {
      await signOut({ redirect: false });

      const authorizationParams =
        provider === "github"
          ? { prompt: "select_account" }
          : {
              prompt: "consent select_account",
              access_type: "offline",
              response_type: "code",
            };

      await signIn(
        provider,
        {
          redirectTo: "/dashboard",
        },
        authorizationParams,
      );
    } catch {
      setFeedback("Could not start sign-in. Please try again.");
    }
  }

  function handlePreferredSignIn() {
    setAccountStatus(null);
    setFeedback("");
    setStep("email");

    window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 0);
  }

  async function loadAccountStatus(emailAddress: string) {
    const response = await fetch("/api/auth/account-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailAddress }),
    });
    const result = (await response.json()) as {
      error?: string;
      message?: string;
      exists?: boolean;
      hasPassword?: boolean;
    };

    if (!response.ok) {
      throw new Error(
        result.message ?? "Could not check this account. Please try again.",
      );
    }

    return {
      exists: Boolean(result.exists),
      hasPassword: Boolean(result.hasPassword),
    };
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail) return;

    if (step === "email") {
      setPending(true);

      try {
        const status = await loadAccountStatus(trimmedEmail);
        setEmail(trimmedEmail);
        setAccountStatus(status);
        setStep("password");
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Could not check this account. Please try again.",
        );
      } finally {
        setPending(false);
      }
      return;
    }

    if (step === "password") {
      if (password.trim().length < 8) return;

      setPending(true);
      setEmail(trimmedEmail);
      setFeedback("");

      try {
        const currentStatus =
          accountStatus ?? (await loadAccountStatus(trimmedEmail));
        setAccountStatus(currentStatus);

        if (currentStatus.hasPassword) {
          const signInResponse = await signIn("credentials", {
            email: trimmedEmail,
            password,
            redirectTo: "/dashboard",
            redirect: false,
          });

          if (
            signInResponse &&
            !signInResponse.error &&
            signInResponse.url
          ) {
            router.push("/dashboard");
            router.refresh();
            return;
          }

          setFeedback("Invalid email or password.");
          return;
        }

        const response = await fetch("/api/auth/otp/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            purpose: "sign_in_email",
          }),
        });

        const result = (await response.json()) as {
          error?: string;
          message?: string;
          next?: "otp_required" | "password_signin_available";
        };

        if (!response.ok) {
          throw new Error(
            result.message ?? "Could not send verification code.",
          );
        }

        if (result.next === "password_signin_available") {
          setAccountStatus({ exists: true, hasPassword: true });
          setFeedback("Invalid email or password.");
          return;
        }

        setOtpDigits(Array<string>(6).fill(""));
        setStep("otp");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not send verification code.");
      } finally {
        setPending(false);
      }
    }
  }

  function handleOtpChange(index: number, value: string) {
    setFeedback("");
    const digit = value.replace(/\D/g, "").slice(-1);
    if (!digit) return;

    setOtpDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    if (index < otpDigits.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();
      setFeedback("");

      setOtpDigits((current) => {
        const next = [...current];

        if (next[index]) {
          next[index] = "";
          return next;
        }

        if (index > 0) {
          next[index - 1] = "";
        }

        return next;
      });

      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!digits) return;

    setFeedback("");
    const next = Array<string>(6).fill("");
    digits.split("").forEach((digit, index) => {
      next[index] = digit;
    });
    setOtpDigits(next);

    const focusIndex = Math.min(digits.length, 5);
    otpInputRefs.current[focusIndex]?.focus();
  }

  async function handleOtpVerify() {
    const otp = otpDigits.join("");
    if (otp.length !== 6) return;
    setPending(true);
    setFeedback("");

    const response = await signIn("credentials", {
      email,
      password,
      otpCode: otp,
      redirectTo: "/dashboard",
      redirect: false,
    });

    setPending(false);

    if (response && !response.error && response.url) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setFeedback("Incorrect verification code.");
  }

  return (
    <main className="gf-login-page">
      <div className="gf-bg">
        <div className="gf-soft-aurora">
          <SoftAurora
            speed={0.6}
            scale={1.5}
            brightness={1}
            color1="#0890f2"
            color2="#1f54dc"
            noiseFrequency={2.5}
            noiseAmplitude={1}
            bandHeight={0.5}
            bandSpread={1}
            octaveDecay={0.1}
            layerOffset={0}
            colorSpeed={1}
            enableMouseInteraction
            mouseInfluence={0.25}
          />
        </div>

        <div className="gf-bg-grid" />
        <div className="gf-bg-overlay" />
      </div>

      <header className="gf-login-header">
        <a href="/" className="gf-logo">
          Git<span>Fuse</span>
        </a>

        <a href="/" className="gf-login-close" aria-label="Close and return home">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="gf-login-close-icon"
          >
            <path
              d="M6.4 6.4L17.6 17.6M17.6 6.4L6.4 17.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </a>
      </header>

      {step === "otp" ? (
        <section className="gf-otp-shell">
          <div className="gf-otp-card">
            <div className="gf-otp-icon">
              <ShieldCheck size={26} />
            </div>

            <p className="gf-login-eyebrow">Verify your account</p>

            <h1>Enter the OTP sent to your email.</h1>

            <p className="gf-otp-copy">
              We sent a one-time verification code to{" "}
              <strong>{maskedEmail}</strong>. Enter it below to continue to your
              GitFuse workspace.
            </p>

            <div className="gf-otp-inputs" aria-label="OTP input placeholders">
              {Array.from({ length: 6 }).map((_, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    otpInputRefs.current[index] = element;
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={otpDigits[index]}
                  onChange={(event) => handleOtpChange(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  onPaste={handleOtpPaste}
                  aria-label={`OTP digit ${index + 1}`}
                />
              ))}
            </div>

            {feedback ? (
              <p className="gf-otp-copy gf-auth-error-text">{feedback}</p>
            ) : null}

            <button
              type="button"
              className="gf-login-primary-wide"
              onClick={handleOtpVerify}
              disabled={pending || otpDigits.join("").length !== 6}
            >
              Verify and continue
            </button>

            <button
              type="button"
              className="gf-login-muted-button"
              onClick={() => setStep("password")}
            >
              Change email or password
            </button>
          </div>
        </section>
      ) : (
        <section className="gf-login-shell">
          <div className="gf-login-copy">
            <div className="gf-pill">
              <span className="gf-pill-dot" />
              Private commit sync for developers
            </div>

            <h1>Start your GitFuse workspace.</h1>

            <p>
              Create your account with email first. GitHub and Google sign-in
              can now continue through NextAuth. Email OTP remains available as
              the first custom account flow.
            </p>

            <div className="gf-login-terminal">
              <div className="gf-terminal-top">
                <div>
                  <span />
                  <span />
                  <span />
                </div>
                <p>after account setup</p>
              </div>

              <code>
                <span>
                  <em>$</em> gitfuse auth login
                </span>
                <span className="gf-terminal-ok">✓ email verified</span>
                <span className="gf-terminal-ok">✓ device registered</span>
                <span className="gf-terminal-ok">✓ workspace ready</span>
              </code>
            </div>
          </div>

          <div className="gf-login-card">
            <div className="gf-login-card-head">
              <p className="gf-login-eyebrow">Welcome to GitFuse</p>
              <h2>Sign in or create account</h2>
              <span>
                Enter your email to begin. You will set a password and verify
                with OTP before entering your dashboard.
              </span>
            </div>

            <form className="gf-email-form" onSubmit={handleEmailSubmit}>
              <label htmlFor="email">Email address</label>

              <div
                className={`gf-email-row ${
                  step !== "email" ? "gf-email-row-locked" : ""
                }`}
              >
                <div className="gf-email-input-wrap">
                  <Mail size={18} />
                  <input
                    ref={emailInputRef}
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                {step === "email" ? (
                  <button
                    type="submit"
                    className="gf-arrow-button"
                    aria-label="Continue with email"
                    disabled={pending}
                  >
                    <ArrowRight size={20} />
                  </button>
                ) : null}
              </div>

              {step === "password" ? (
                <div className="gf-password-step">
                  <label htmlFor="password">
                    {accountStatus?.hasPassword
                      ? "Enter password"
                      : "Create new password"}
                  </label>

                  <div className="gf-password-row">
                    <input
                      id="password"
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={
                        accountStatus?.hasPassword
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={8}
                      required
                    />

                    <button
                      type="submit"
                      className="gf-arrow-button"
                      aria-label={
                        accountStatus?.hasPassword
                          ? "Sign in with password"
                          : "Continue to OTP verification"
                      }
                      disabled={pending}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>

                  <p>
                    {accountStatus?.hasPassword
                      ? "Enter the password for this GitFuse account to continue to your dashboard."
                      : "You can still edit the email above. Use at least 8 characters. The next screen will verify your email with an OTP."}
                  </p>
                  {feedback ? (
                    <p className="gf-auth-error-text">{feedback}</p>
                  ) : null}
                </div>
              ) : null}
            </form>

            {step === "email" && feedback ? (
              <p className="gf-auth-error-text">{feedback}</p>
            ) : null}

            <div className="gf-login-divider">
              <span />
              <p>or continue with</p>
              <span />
            </div>

            <div className="gf-social-grid">
              <button
                type="button"
                className="gf-social-button"
                onClick={() => openOAuth("google")}
              >
                <GoogleIcon />
                Sign in with Google
              </button>

              <button
                type="button"
                className="gf-social-button"
                onClick={() => openOAuth("github")}
              >
                <GitHubIcon />
                Sign in with GitHub
              </button>

              <button
                type="button"
                className="gf-social-button gf-social-button-wide"
                onClick={handlePreferredSignIn}
              >
                <Mail size={19} />
                Use preferred sign-in
              </button>
            </div>

            <p className="gf-login-note">
              Google and GitHub use your configured NextAuth providers. Email
              setup and OTP verification continue through the custom GitFuse
              account flow.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="gf-google-icon">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.25-.98 2.31-2.08 3.02v2.51h3.36C20.74 17.82 22 15.16 22 12c0-.66-.06-1.29-.17-1.9H12Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.8 0 5.15-.92 6.87-2.49l-3.36-2.51c-.93.62-2.12.99-3.51.99-2.7 0-4.99-1.82-5.81-4.27H2.72v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.19 13.72A6.01 6.01 0 0 1 5.88 12c0-.6.11-1.18.31-1.72V7.69H2.72A10 10 0 0 0 2 12c0 1.61.38 3.13 1.06 4.31l3.13-2.59Z"
      />
      <path
        fill="#4285F4"
        d="M12 6.01c1.52 0 2.89.52 3.96 1.55l2.98-2.98C17.14 2.91 14.8 2 12 2a10 10 0 0 0-9.28 5.69l3.47 2.59C7.01 7.83 9.3 6.01 12 6.01Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="gf-github-icon">
      <path
        fill="currentColor"
        d="M12 0C5.37 0 0 5.5 0 12.3c0 5.44 3.44 10.05 8.2 11.68.6.12.82-.27.82-.59 0-.29-.01-1.06-.02-2.08-3.34.74-4.04-1.65-4.04-1.65-.55-1.42-1.34-1.8-1.34-1.8-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.88 2.81 1.34 3.5 1.02.11-.79.42-1.34.76-1.64-2.67-.31-5.47-1.37-5.47-6.1 0-1.35.47-2.45 1.24-3.31-.12-.31-.54-1.57.12-3.26 0 0 1.01-.33 3.3 1.27A11.2 11.2 0 0 1 12 5.95c1.02 0 2.05.14 3.01.41 2.29-1.6 3.3-1.27 3.3-1.27.66 1.69.24 2.95.12 3.26.77.86 1.24 1.96 1.24 3.31 0 4.74-2.81 5.78-5.49 6.09.43.38.81 1.12.81 2.26 0 1.63-.01 2.95-.01 3.35 0 .33.22.72.83.59A12.25 12.25 0 0 0 24 12.3C24 5.5 18.63 0 12 0Z"
      />
    </svg>
  );
}
