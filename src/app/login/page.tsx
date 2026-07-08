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
    "w-full rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-[#2c3a2e] outline-none focus:border-[#8aa06f]";
  const buttonClass =
    "w-full rounded-2xl bg-[#2c3a2e] px-4 py-3 font-medium text-white disabled:opacity-60";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f6f2] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d3e29f] text-lg font-semibold text-[#2c3a2e]">
            D
          </span>
          <span className="text-2xl font-semibold tracking-tight text-[#2c3a2e]">Demi</span>
        </div>

        {step === "email" ? (
          <>
            <h1 className="text-xl font-semibold text-[#2c3a2e]">Sign in with a code</h1>
            <p className="mt-1 text-sm text-[#829084]">
              No password. We email you a 6-digit code and you're in.
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
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-[#2c3a2e]">Enter your code</h1>
            <p className="mt-1 text-sm text-[#829084]">
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
                  className="text-[#7a9a4e] underline-offset-2 hover:underline"
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
                  className="text-[#7a9a4e] underline-offset-2 hover:underline disabled:opacity-50"
                  onClick={() => sendCode()}
                >
                  Resend code
                </button>
              </div>
            </form>
          </>
        )}

        {notice && !errorMessage && <p className="mt-3 text-sm text-[#5d6b5f]">{notice}</p>}
        {(errorMessage || linkError) && (
          <p className="mt-3 text-sm text-red-700">
            {errorMessage || "That link expired or was invalid. Request a code instead."}
          </p>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-[#829084]">
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
