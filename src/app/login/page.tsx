"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const params = useSearchParams();
  const linkError = params.get("error");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });

    if (error) {
      const rateLimited =
        error.status === 429 ||
        ("code" in error && error.code === "over_email_send_rate_limit") ||
        /rate limit/i.test(error.message);
      setErrorMessage(
        rateLimited
          ? "Email limit reached. Supabase only sends a couple of sign-in emails per hour. Wait a bit, or check your inbox for an earlier link."
          : "Something went wrong. Try again.",
      );
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f6f2] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d3e29f] text-lg font-semibold text-[#2c3a2e]">
            D
          </span>
          <span className="text-2xl font-semibold tracking-tight text-[#2c3a2e]">Demi</span>
        </div>

        <h1 className="text-xl font-semibold text-[#2c3a2e]">Sign in with a magic link</h1>
        <p className="mt-1 text-sm text-[#829084]">
          No password. We email you a link and you&apos;re in.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-2xl bg-white p-5 text-sm leading-6 text-[#2c3a2e] shadow-sm">
            Check your inbox. The link signs you in on this device.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-[#2c3a2e] outline-none focus:border-[#8aa06f]"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-2xl bg-[#2c3a2e] px-4 py-3 font-medium text-white disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Email me a link"}
            </button>
            {(status === "error" || linkError) && (
              <p className="text-sm text-red-700">
                {status === "error"
                  ? errorMessage
                  : "That link expired or was invalid. Request a new one."}
              </p>
            )}
          </form>
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
