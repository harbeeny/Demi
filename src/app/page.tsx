/**
 * Landing page. Server component, no client state.
 * Design read: consumer wellness landing, preserve brand (Forest palette:
 * deep green + bone + lime). Dials: VARIANCE 6 / MOTION 4 / DENSITY 3.
 * The hero visual is a real component preview (mini Today screen), not a
 * fake screenshot: same ring SVG and card markup the product renders.
 */

import { AppRedirect } from "@/components/AppRedirect";

const SAMPLE_RINGS = [
  { label: "kcal", value: 1470, target: 2240, color: "#2c3a2e" },
  { label: "protein", value: 106, target: 164, color: "#7a9a4e" },
  { label: "carbs", value: 160, target: 248, color: "#c9a44c" },
  { label: "fat", value: 40, target: 66, color: "#a4785c" },
];

const SAMPLE_MEALS = [
  {
    slot: "BREAKFAST · 8:00 AM",
    name: "Protein smoothie",
    macros: "390 kcal · P 32g",
    why: "Quick protein and carbs to fuel your morning.",
  },
  {
    slot: "LUNCH · 2:00 PM",
    name: "Chicken and rice",
    macros: "520 kcal · P 38g",
    why: "Steady energy that keeps you satisfied through the afternoon.",
  },
];

const STEPS = [
  {
    title: "Answer ten questions",
    body: "Height, weight, goal, schedule, and what you like to eat. Two minutes on your phone.",
  },
  {
    title: "Get your numbers",
    body: "Calories and macros computed from your body and goal, with the reasoning shown next to every figure.",
  },
  {
    title: "Eat with a why",
    body: "A daily plan of real meals that fit your targets, each with one line explaining why it earns its place.",
  },
];

const GUARDRAILS = [
  {
    title: "Calorie floors, enforced in code",
    body: "Targets never drop below 1,200 or 1,500 kcal, and never below 80% of your measured metabolism.",
    tone: "dark" as const,
  },
  {
    title: "No crash pace",
    body: "Suggested loss is capped at 1% of bodyweight per week. Faster tends to cost muscle and rebound.",
    tone: "light" as const,
  },
  {
    title: "The AI cannot invent numbers",
    body: "Every calorie and macro comes from a verified food database. The model only picks and explains.",
    tone: "lime" as const,
  },
  {
    title: "Supportive by design",
    body: "No streaks for eating less, no restriction framing, and a real resource if food ever feels stressful.",
    tone: "light" as const,
  },
];

function PreviewRing({ label, value, target, color }: (typeof SAMPLE_RINGS)[number]) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / target);
  return (
    <div className="flex flex-col items-center">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="#eef1ea" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={r} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="25" textAnchor="middle" fontSize="9" fontWeight="600" fill="#2c3a2e">
          {value}
        </text>
      </svg>
      <span className="mt-0.5 text-[8px] text-[#829084]">{label}</span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-[#f4f6f2] text-[#2c3a2e]">
      <AppRedirect />
      {/* Nav: single line, 64px */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#d8ee9a] font-semibold text-[#1e3d2a]">
            D
          </span>
          <span className="text-lg font-semibold tracking-tight">Demi</span>
        </div>
        <a
          href="/login"
          className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm font-medium hover:border-[#8aa06f]"
        >
          Sign in
        </a>
      </header>

      {/* Hero: asymmetric split, copy left, real component preview right */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 md:grid-cols-[7fr_5fr] md:pt-20">
        <div>
          <h1
            className="rise-in text-4xl font-semibold leading-[1.05] tracking-tighter md:text-6xl"
            style={{ "--rise-index": 0 } as React.CSSProperties}
          >
            Meals planned around your numbers.
          </h1>
          <p
            className="rise-in mt-5 max-w-[46ch] text-base leading-relaxed text-[#5d6b5f] md:text-lg"
            style={{ "--rise-index": 1 } as React.CSSProperties}
          >
            Demi computes your calories and macros, picks real meals that fit, and explains why each one earns its place.
          </p>
          <div
            className="rise-in mt-8 flex items-center gap-4"
            style={{ "--rise-index": 2 } as React.CSSProperties}
          >
            <a
              href="/login"
              className="press rounded-full bg-[#1e3d2a] px-7 py-3.5 font-medium text-white"
            >
              Get started
            </a>
            <a
              href="#how"
              className="press rounded-full px-4 py-3.5 font-medium text-[#3c4a3e] underline-offset-4 hover:underline"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Real component preview: the product's actual ring + card markup, sample data */}
        <div
          className="rise-in mx-auto w-full max-w-[320px]"
          style={{ "--rise-index": 3 } as React.CSSProperties}
        >
          <div className="rounded-[2rem] border border-[#dce3d7] bg-white p-4 shadow-[0_24px_60px_rgba(44,58,46,0.12)]">
            <p className="px-1 text-xs font-medium text-[#829084]">Today · sample day</p>
            <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-[#f4f6f2] p-3">
              {SAMPLE_RINGS.map((ring) => (
                <PreviewRing key={ring.label} {...ring} />
              ))}
            </div>
            <div className="mt-3 space-y-2.5">
              {SAMPLE_MEALS.map((meal) => (
                <div key={meal.slot} className="rounded-2xl border border-[#eef1ea] p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-[#829084]">
                    {meal.slot}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{meal.name}</p>
                  <p className="mt-0.5 text-[10px] text-[#5d6b5f]">{meal.macros}</p>
                  <p className="mt-1 text-[11px] leading-4 text-[#5d6b5f]">{meal.why}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works: numbered vertical rail, asymmetric columns */}
      <section id="how" className="border-t border-[#e3e9df] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="text-3xl font-semibold tracking-tighter md:text-4xl">
            From ten answers to tonight&apos;s dinner
          </h2>
          <div className="mt-12 space-y-10 md:mt-16">
            {STEPS.map((step, i) => (
              <div key={step.title} className="grid gap-2 md:grid-cols-[1fr_2fr_2fr] md:gap-8">
                <span className="text-5xl font-semibold tracking-tighter text-[#c9d6c2] md:text-6xl">
                  {i + 1}
                </span>
                <h3 className="text-xl font-semibold tracking-tight md:pt-3">{step.title}</h3>
                <p className="max-w-[52ch] leading-relaxed text-[#5d6b5f] md:pt-3">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Statement band: the one deliberate theme block on the page */}
      <section className="bg-[#1e3d2a] text-[#f5f4e9]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="max-w-[16ch] text-3xl font-semibold leading-[1.1] tracking-tighter md:text-5xl">
            Every number has a why.
          </h2>
          <p className="mt-5 max-w-[52ch] leading-relaxed text-[#c9d9c8]">
            Nothing in your plan is a black box. Tap any figure and Demi shows the rule behind it.
          </p>
          <figure className="mt-10 max-w-xl rounded-2xl border border-[#4c6b53] bg-[#244630] p-5">
            <p className="text-sm leading-6 text-[#e9efdd]">
              A 1 lb/week loss works out to 495 kcal below your 2,703 kcal daily burn.
            </p>
            <figcaption className="mt-2 text-xs text-[#8fae95]">
              Example reasoning from a sample profile
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Guardrails: 4-cell bento, varied cell backgrounds */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <h2 className="text-3xl font-semibold tracking-tighter md:text-4xl">
          Built to keep you safe, not hooked
        </h2>
        <p className="mt-4 max-w-[52ch] leading-relaxed text-[#5d6b5f]">
          The guardrails are code, not promises. They run on the server where neither a clever prompt nor a bad day can switch them off.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {GUARDRAILS.map((g) => (
            <div
              key={g.title}
              className={
                g.tone === "dark"
                  ? "rounded-2xl bg-[#1e3d2a] p-7 text-[#f5f4e9]"
                  : g.tone === "lime"
                    ? "rounded-2xl bg-[#e4efc4] p-7"
                    : "rounded-2xl border border-[#dce3d7] bg-white p-7"
              }
            >
              <h3 className="text-lg font-semibold tracking-tight">{g.title}</h3>
              <p
                className={`mt-2 leading-relaxed ${
                  g.tone === "dark" ? "text-[#c9d9c8]" : "text-[#5d6b5f]"
                }`}
              >
                {g.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Closer + footer */}
      <section className="border-t border-[#e3e9df] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center md:py-24">
          <h2 className="mx-auto max-w-[20ch] text-3xl font-semibold tracking-tighter md:text-4xl">
            Know what to eat tonight.
          </h2>
          <a
            href="/login"
            className="press mt-8 inline-block rounded-full bg-[#1e3d2a] px-8 py-4 font-medium text-white"
          >
            Get started
          </a>
        </div>
        <footer className="border-t border-[#e3e9df]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-[#829084] md:flex-row">
            <span>Demi</span>
            <span>General wellness guidance, not medical advice.</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
