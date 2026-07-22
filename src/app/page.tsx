/**
 * Landing page. Server component, no client state.
 * Design read: consumer wellness landing, preserve brand (Forest palette:
 * deep green + bone + lime). Dials: VARIANCE 6 / MOTION 4 / DENSITY 3.
 * The hero visual is a real component preview (mini Today screen), not a
 * fake screenshot: same ring SVG and card markup the product renders.
 */

import { AppRedirect } from "@/components/AppRedirect";

/* Sample day: 1,470 of 2,240 kcal eaten, so 770 left; macros show the
   same remaining-first reading the hero uses in the product. */
const SAMPLE_MACROS = [
  { label: "Protein left", left: 58, had: 106, target: 164, color: "var(--macro-protein)" },
  { label: "Carbs left", left: 88, had: 160, target: 248, color: "var(--macro-carbs)" },
  { label: "Fat left", left: 26, had: 40, target: 66, color: "var(--macro-fat)" },
];

/* Trailing week for the mini day strip: arcs are eaten/target, W is today,
   Monday wears the goal-met badge. */
const SAMPLE_WEEK = [
  { day: "T", progress: 0.9 },
  { day: "F", progress: 0.7 },
  { day: "S", progress: 0.4 },
  { day: "S", progress: 0.8 },
  { day: "M", progress: 1, goalMet: true },
  { day: "T", progress: 0.85 },
  { day: "W", progress: 0.65, selected: true },
];

const STEPS = [
  {
    title: "Answer a few questions",
    body: "Height, weight, goal, schedule, and what you like to eat. A few minutes on your phone.",
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

/* Tease the daily texture without explaining the machinery. */
const FEATURES = [
  {
    title: "Log it in seconds",
    body: "Scan a barcode, snap a nutrition label, or search a verified food database. If it has numbers, Demi finds them.",
  },
  {
    title: "Big night? Balance it.",
    body: "One tap spreads last night across the rest of your week, inside safe limits. No guilt spiral, no starving it off.",
  },
  {
    title: "Feeling lazy? Order it.",
    body: "Any meal on your plan hands off to DoorDash or Uber Eats in a tap, so takeout nights stay on plan too.",
  },
  {
    title: "Watch it pay off",
    body: "Rings fill as you eat, goal days earn their badge, and streaks build. Progress you can feel by Thursday.",
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

/* The product's ring: track circle plus a round-capped progress arc. */
function PreviewRing({
  progress,
  size,
  stroke,
  color,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, progress);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/* Mini day strip circle, arc and goal badge included. */
function PreviewDay({ day, progress, selected, goalMet }: (typeof SAMPLE_WEEK)[number]) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r={r} fill={selected ? "var(--ink)" : goalMet ? "var(--tint)" : "var(--surface)"} stroke="var(--border)" strokeWidth="2" />
        <circle
          cx="12" cy="12" r={r} fill="none"
          stroke={selected ? "var(--accent-tint)" : "var(--accent)"} strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${Math.min(1, progress) * c} ${c}`}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span className={`absolute text-[8px] font-medium ${selected ? "text-(--ink-contrast)" : "text-(--ink)"}`}>
        {day}
      </span>
      {goalMet && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-[9px] w-[9px] items-center justify-center rounded-full bg-(--accent-strong) ring-1 ring-(--surface)">
          <svg width="5" height="5" viewBox="0 0 24 24" fill="none" stroke="var(--surface)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-(--bg) text-(--ink)">
      <AppRedirect />
      {/* Nav: single line, 64px */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-(--accent-tint) font-semibold text-(--ink)">
            D
          </span>
          <span className="text-lg font-semibold tracking-tight">Demi</span>
        </div>
        <a
          href="/login"
          className="press rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-sm font-medium hover:border-(--accent)"
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
            Results are made in the kitchen.
          </h1>
          <p
            className="rise-in mt-5 max-w-[46ch] text-base leading-relaxed text-(--ink-2) md:text-lg"
            style={{ "--rise-index": 1 } as React.CSSProperties}
          >
            Don&apos;t know where to start? Training hard and seeing nothing change? The answer
            is usually the plate. Demi is nutrition first: it computes your numbers, plans real
            meals that fit them, and shows the why behind every one, so you lose weight the
            right way and keep it off.
          </p>
          <div
            className="rise-in mt-8 flex items-center gap-4"
            style={{ "--rise-index": 2 } as React.CSSProperties}
          >
            <a
              href="/login"
              className="press rounded-full bg-(--ink) px-7 py-3.5 font-medium text-(--ink-contrast)"
            >
              Get started
            </a>
            <a
              href="#how"
              className="press rounded-full px-4 py-3.5 font-medium text-(--tint-ink) underline-offset-4 hover:underline"
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
          <div className="rounded-[2rem] border border-(--border) bg-(--bg) p-4 shadow-[0_24px_60px_rgba(44,58,46,0.12)]">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-(--muted)">Today · sample day</p>
              <span className="text-[9px] text-(--muted)">🔥 6 day streak</span>
            </div>

            {/* Mini day strip, goal badge on Monday, today selected */}
            <div className="mt-3 flex justify-between px-1">
              {SAMPLE_WEEK.map((d, i) => (
                <PreviewDay key={i} {...d} />
              ))}
            </div>

            {/* Calories-left hero: big number left, one ring right */}
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-(--surface) p-3.5 shadow-sm">
              <div>
                <p className="text-2xl font-semibold tracking-tight">770</p>
                <p className="mt-0.5 text-[10px] text-(--ink-2)">Calories left</p>
              </div>
              <div className="relative flex items-center justify-center">
                <PreviewRing progress={1470 / 2240} size={52} stroke={5} color="var(--accent-strong)" />
                <span aria-hidden className="absolute text-[11px]">❋</span>
              </div>
            </div>

            {/* Three macro cards, remaining-first like the product */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SAMPLE_MACROS.map((m) => (
                <div key={m.label} className="rounded-2xl bg-(--surface) p-2 text-center shadow-sm">
                  <p className="text-xs font-semibold">{m.left}g</p>
                  <p className="text-[8px] text-(--muted)">{m.label}</p>
                  <div className="mt-1 flex justify-center">
                    <PreviewRing progress={m.had / m.target} size={26} stroke={3.5} color={m.color} />
                  </div>
                </div>
              ))}
            </div>

            {/* One meal section: a suggestion and a logged row */}
            <p className="mt-3 px-1 text-[8px] font-medium uppercase tracking-wide text-(--muted)">
              Lunch · 2:00 PM
            </p>
            <div className="mt-1.5 space-y-1.5">
              <div className="rounded-2xl bg-(--surface) p-2.5 shadow-sm">
                <p className="text-[8px] font-medium uppercase tracking-wide text-(--muted)">Suggested</p>
                <p className="mt-0.5 text-xs font-medium">Chicken and rice</p>
                <p className="mt-0.5 text-[9px] text-(--ink-2)">520 kcal · P 38g</p>
                <div className="mt-1.5 flex justify-end">
                  <span className="rounded-full border border-(--border) px-2.5 py-1 text-[9px]">I ate this</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-(--surface) p-2.5 shadow-sm">
                <div>
                  <p className="text-xs font-medium">Greek yogurt bowl</p>
                  <p className="mt-0.5 text-[9px] text-(--ink-2)">320 kcal · P 21g</p>
                </div>
                <span className="text-[9px] text-(--muted)">Undo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works: numbered vertical rail, asymmetric columns */}
      <section id="how" className="border-t border-(--border) bg-(--surface)">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="text-3xl font-semibold tracking-tighter md:text-4xl">
            From a few answers to tonight&apos;s dinner
          </h2>
          <div className="mt-12 space-y-10 md:mt-16">
            {STEPS.map((step, i) => (
              <div key={step.title} className="grid gap-2 md:grid-cols-[1fr_2fr_2fr] md:gap-8">
                <span className="text-5xl font-semibold tracking-tighter text-(--border) md:text-6xl">
                  {i + 1}
                </span>
                <h3 className="text-xl font-semibold tracking-tight md:pt-3">{step.title}</h3>
                <p className="max-w-[52ch] leading-relaxed text-(--ink-2) md:pt-3">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Daily texture: four teasers, value shown, mechanics kept back */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <h2 className="text-3xl font-semibold tracking-tighter md:text-4xl">
          Built for real weeks, not perfect ones
        </h2>
        <p className="mt-4 max-w-[52ch] leading-relaxed text-(--ink-2)">
          The plan is the start. The rest of Demi is for the days that don&apos;t go to plan.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-(--border) bg-(--bg) p-7">
              <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-(--ink-2)">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Statement band: the one deliberate theme block on the page */}
      <section className="bg-(--ink) text-(--surface-2)">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="max-w-[16ch] text-3xl font-semibold leading-[1.1] tracking-tighter md:text-5xl">
            Every number has a why.
          </h2>
          <p className="mt-5 max-w-[52ch] leading-relaxed text-(--border)">
            Nothing in your plan is a black box. Tap any figure and Demi shows the rule behind it.
          </p>
          <figure className="mt-10 max-w-xl rounded-2xl border border-(--ink-2) bg-(--accent-deep) p-5">
            <p className="text-sm leading-6 text-(--tint)">
              A 1 lb/week loss works out to 495 kcal below your 2,703 kcal daily burn.
            </p>
            <figcaption className="mt-2 text-xs text-(--accent)">
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
        <p className="mt-4 max-w-[52ch] leading-relaxed text-(--ink-2)">
          The guardrails are code, not promises. They run on the server where neither a clever prompt nor a bad day can switch them off.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {GUARDRAILS.map((g) => (
            <div
              key={g.title}
              className={
                g.tone === "dark"
                  ? "rounded-2xl bg-(--ink) p-7 text-(--surface-2)"
                  : g.tone === "lime"
                    ? "rounded-2xl bg-(--tint) p-7"
                    : "rounded-2xl border border-(--border) bg-(--surface) p-7"
              }
            >
              <h3 className="text-lg font-semibold tracking-tight">{g.title}</h3>
              <p
                className={`mt-2 leading-relaxed ${
                  g.tone === "dark" ? "text-(--border)" : "text-(--ink-2)"
                }`}
              >
                {g.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Closer + footer */}
      <section className="border-t border-(--border) bg-(--surface)">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center md:py-24">
          <h2 className="mx-auto max-w-[20ch] text-3xl font-semibold tracking-tighter md:text-4xl">
            Know what to eat tonight.
          </h2>
          <a
            href="/login"
            className="press mt-8 inline-block rounded-full bg-(--ink) px-8 py-4 font-medium text-(--ink-contrast)"
          >
            Get started
          </a>
        </div>
        <footer className="border-t border-(--border)">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-(--muted) md:flex-row">
            <span>Demi</span>
            <span>General wellness guidance, not medical advice.</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
