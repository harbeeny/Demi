"use client";

/**
 * Illustrative weight-over-time comparison for the onboarding interstitial:
 * a quick-fix diet dips fast and rebounds past its start; a paced deficit
 * settles lower and stays there. Deliberately labeled illustrative; it is a
 * concept sketch, not user data.
 */
export function LongTermChart() {
  return (
    <div className="rounded-2xl bg-(--surface) p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-(--ink)">Your weight</p>
        <p className="text-xs text-(--muted)">Illustrative</p>
      </div>
      <svg viewBox="0 0 300 150" className="mt-3 w-full" role="img"
        aria-label="Illustrative chart: a quick-fix diet drops weight fast then rebounds above where it started, while a steady pace keeps going down and stays down">
        <line x1="12" y1="30" x2="288" y2="30" className="stroke-(--border)" strokeWidth="1" strokeDasharray="3 4" />
        <line x1="12" y1="112" x2="288" y2="112" className="stroke-(--border)" strokeWidth="1" strokeDasharray="3 4" />
        <path
          d="M 16 30 C 60 34 78 92 108 96 C 138 100 176 44 208 26 C 232 13 260 10 284 10"
          fill="none" className="stroke-(--over)" strokeWidth="2.5" strokeLinecap="round"
        />
        <path
          d="M 16 30 C 70 32 96 58 140 82 C 178 102 224 112 284 112"
          fill="none" className="stroke-(--ink)" strokeWidth="2.5" strokeLinecap="round"
        />
        <circle cx="16" cy="30" r="5" className="fill-(--surface) stroke-(--ink)" strokeWidth="2" />
        <circle cx="284" cy="112" r="5" className="fill-(--surface) stroke-(--ink)" strokeWidth="2" />
        <text x="212" y="52" className="fill-(--over)" fontSize="11">Quick-fix diet</text>
        <text x="150" y="128" className="fill-(--ink)" fontSize="11" fontWeight="600">With Demi</text>
      </svg>
      <div className="mt-1 flex justify-between text-sm text-(--muted)">
        <span>Month 1</span>
        <span>Month 6</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-(--ink-2)">
        Crash diets rebound because they can&apos;t be lived in. Demi paces your
        loss at a sustainable rate, near 1% of bodyweight a week at most, so the
        change you make is one you keep.
      </p>
    </div>
  );
}
