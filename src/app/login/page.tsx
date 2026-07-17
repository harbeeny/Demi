"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const linkError = params.get("error");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  function describeSendError(error: { status?: number; code?: string; message: string }) {
    const rateLimited =
      error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      /rate limit/i.test(error.message);
    return rateLimited
      ? "Email limit reached. Supabase only sends a couple of sign-in emails per hour. Wait a bit and try again."
      : "Couldn't send the code. Try again.";
  }

  // Temporary bypass while email delivery is being set up: creates a real
  // anonymous session so RLS works end to end. Remove once email OTP is the
  // only path, or keep and link the email later via supabase.auth.updateUser.
  async function skipSignIn() {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      setErrorMessage(
        /anonymous/i.test(error.message)
          ? "Anonymous sign-in is disabled. Enable it in Supabase: Authentication -> Sign In / Providers -> Anonymous."
          : "Couldn't start a guest session. Try again.",
      );
      setBusy(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });

    if (error) {
      setErrorMessage(describeSendError(error));
    } else {
      setStep("code");
      setNotice("We emailed you a 6-digit code.");
    }
    setBusy(false);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const token = code.trim();
    if (token.length < 6 || busy) return;
    setBusy(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });

    if (error) {
      setErrorMessage("That code didn't match or has expired. Check the digits or request a new one.");
      setBusy(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let dest = "/onboarding";
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("id", user.id)
        .single();
      if (profile?.onboarding_complete) dest = "/today";
    }

    router.push(dest);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-2xl border border-(--border-input) bg-(--field) px-4 py-3 text-(--ink) outline-none transition-[border-color,box-shadow] duration-150 focus:border-(--accent) focus:shadow-[0_0_0_3px_rgba(138,160,111,0.15)]";
  const buttonClass =
    "press w-full rounded-2xl bg-(--ink) px-4 py-3 font-medium text-(--ink-contrast) disabled:opacity-60";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-(--bg) px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-(--accent-tint) text-lg font-semibold text-(--ink)">
            D
          </span>
          <span className="text-2xl font-semibold tracking-tight text-(--ink)">Demi</span>
        </div>

        {step === "email" ? (
          <>
            <h1 className="text-xl font-semibold text-(--ink)">Sign in with a code</h1>
            <p className="mt-1 text-sm text-(--muted)">
              No password. We email you a 6-digit code and you&apos;re in.
            </p>
            <form onSubmit={sendCode} className="mt-6 space-y-3">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
              <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? "Sending..." : "Email me a code"}
              </button>
            </form>
            <div className="mt-4 flex items-center gap-3 text-xs text-(--muted)">
              <span className="h-px flex-1 bg-(--border)" />
              or
              <span className="h-px flex-1 bg-(--border)" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={skipSignIn}
              className="press mt-4 w-full rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 font-medium text-(--ink) hover:border-(--accent) disabled:opacity-60"
            >
              Skip sign-in for now
            </button>
            <p className="mt-2 text-center text-xs text-(--muted)">
              Temporary guest session while email delivery is being set up.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-(--ink)">Enter your code</h1>
            <p className="mt-1 text-sm text-(--muted)">
              Sent to {email.trim()}. It expires in about an hour.
            </p>
            <form onSubmit={verifyCode} className="mt-6 space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
              />
              <button type="submit" disabled={busy || code.length < 6} className={buttonClass}>
                {busy ? "Checking..." : "Sign in"}
              </button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-(--accent-strong) underline-offset-2 hover:underline"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setErrorMessage("");
                    setNotice("");
                  }}
                >
                  Change email
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="text-(--accent-strong) underline-offset-2 hover:underline disabled:opacity-50"
                  onClick={() => sendCode()}
                >
                  Resend code
                </button>
              </div>
            </form>
          </>
        )}

        {notice && !errorMessage && <p className="mt-3 text-sm text-(--ink-2)">{notice}</p>}
        {(errorMessage || linkError) && (
          <p className="mt-3 text-sm text-red-700">
            {errorMessage || "That link expired or was invalid. Request a code instead."}
          </p>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-(--muted)">
          Demi offers general wellness guidance, not medical advice.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
