"use client";

import type { Sex } from "@/lib/supabase/types";

/**
 * Visual body fat picker: a 3x3 grid of stylized torso silhouettes, one set
 * per sex, each tile a labeled range. We store the range midpoint. The
 * figures are parametric SVG (drawn in code, not traced from anyone's app):
 * width, softness, and muscle definition scale with the level index.
 */

export type BodyFatRange = { label: string; midpoint: number };

export const FEMALE_RANGES: BodyFatRange[] = [
  { label: "10-13%", midpoint: 12 },
  { label: "14-17%", midpoint: 16 },
  { label: "18-23%", midpoint: 21 },
  { label: "24-28%", midpoint: 26 },
  { label: "29-33%", midpoint: 31 },
  { label: "34-37%", midpoint: 36 },
  { label: "38-42%", midpoint: 40 },
  { label: "43-49%", midpoint: 46 },
  { label: "50%+", midpoint: 52 },
];

export const MALE_RANGES: BodyFatRange[] = [
  { label: "5-9%", midpoint: 7 },
  { label: "10-14%", midpoint: 12 },
  { label: "15-19%", midpoint: 17 },
  { label: "20-24%", midpoint: 22 },
  { label: "25-29%", midpoint: 27 },
  { label: "30-34%", midpoint: 32 },
  { label: "35-39%", midpoint: 37 },
  { label: "40-49%", midpoint: 45 },
  { label: "50%+", midpoint: 52 },
];

export function rangesForSex(sex: Sex | null): BodyFatRange[] {
  return sex === "male" ? MALE_RANGES : FEMALE_RANGES;
}


/** lerp across the 9 levels; t = 0 (leanest) .. 1 (highest) */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * One torso, front view, cropped by a circle like a portrait badge.
 * Geometry is mirrored around x=50 in a 100x100 viewBox: shoulders at the
 * top edge, waist mid-frame, briefs/hip band at the bottom edge.
 */
function Torso({ sex, level }: { sex: "male" | "female"; level: number }) {
  const t = level / 8;
  const female = sex === "female";

  // Half-widths at key heights. Female figures carry width at the hip,
  // male figures at the waist; both soften and widen with t.
  const shoulder = female ? lerp(24, 30, t) : lerp(29, 34, t);
  const chest = female ? lerp(21, 29, t) : lerp(24, 32, t);
  const waist = female ? lerp(15, 30, t) : lerp(17, 33, t);
  const hip = female ? lerp(23, 34, t) : lerp(20, 31, t);
  // Lean waists tuck in; higher levels bow outward at the belly.
  const bellyBow = lerp(female ? -2 : -1.5, 9, t);

  const side = (dir: 1 | -1) => {
    const s = (w: number) => 50 + dir * w;
    return [
      `L ${s(shoulder)} 12`,
      // armpit notch, then down the ribcage
      `C ${s(shoulder + 2)} 20 ${s(chest + 3)} 24 ${s(chest)} 32`,
      // into the waist with the belly bow controlling curvature
      `C ${s(waist + bellyBow)} 44 ${s(waist + bellyBow)} 52 ${s(waist)} 58`,
      // out to the hip and down to the crop
      `C ${s(hip - 1)} 68 ${s(hip)} 74 ${s(hip - 2)} 88`,
      `L ${s(hip - 4)} 100`,
    ].join(" ");
  };

  // Outline: top of neck -> right trap and side down -> across bottom ->
  // left side up -> back to the neck. The circle crop supplies the head cut.
  const sL = (w: number) => 50 - w;
  const leftUp = [
    `L ${sL(hip - 2)} 88`,
    `C ${sL(hip)} 74 ${sL(hip - 1)} 68 ${sL(waist)} 58`,
    `C ${sL(waist + bellyBow)} 52 ${sL(waist + bellyBow)} 44 ${sL(chest)} 32`,
    `C ${sL(chest + 3)} 24 ${sL(shoulder + 2)} 20 ${sL(shoulder)} 12`,
    `L 42 0 Z`,
  ];
  const body = [`M 58 0`, side(1), `L ${sL(hip - 4)} 100`, leftUp.join(" ")].join(" ");

  // Garments follow the body width at their heights.
  const braTop = `M ${sL(chest + 0.5)} 24 C ${sL(chest - 3)} 30 ${50 + chest - 3} 30 ${50 + chest + 0.5} 24 L ${50 + chest + 1.5} 36 C ${50 + chest - 5} 46 ${sL(chest - 5)} 46 ${sL(chest + 1.5)} 36 Z`;
  const briefsY = female ? 76 : 78;
  const briefs = `M ${sL(hip - 0.5)} ${briefsY} L ${50 + hip - 0.5} ${briefsY} L ${50 + hip - 4} 100 L ${sL(hip - 4)} 100 Z`;

  // Definition fades as t rises: abs on the leanest three, a soft midline
  // after, a single under-belly crease on the highest three.
  const defOpacity = Math.max(0, 1 - t * 2.6);
  const crease = t > 0.66;

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden focusable="false">
      <defs>
        <clipPath id={`bf-clip-${sex}-${level}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#bf-clip-${sex}-${level})`}>
        <circle cx="50" cy="50" r="50" className="fill-(--surface)" />
        <path d={body} className="fill-(--handle) stroke-(--ink)" strokeOpacity="0.3" strokeWidth="1" />
        {defOpacity > 0 && (
          <g className="stroke-(--ink)" strokeOpacity="0.3" strokeWidth="1" fill="none" opacity={defOpacity}>
            <line x1="50" y1={female ? 48 : 40} x2="50" y2={female ? 66 : 68} />
            {!female && (
              <>
                <line x1="43.5" y1="47" x2="56.5" y2="47" />
                <line x1="44" y1="55" x2="56" y2="55" />
                <line x1="44.5" y1="63" x2="55.5" y2="63" />
                <path d="M 38 30 C 44 35 56 35 62 30" />
              </>
            )}
            {female && (
              <>
                <path d={`M ${50 - waist - 1} 46 C ${50 - waist + 4} 52 ${50 - waist + 4} 56 ${50 - waist + 2} 60`} />
                <path d={`M ${50 + waist + 1} 46 C ${50 + waist - 4} 52 ${50 + waist - 4} 56 ${50 + waist - 2} 60`} />
              </>
            )}
          </g>
        )}
        {crease && (
          <path
            d={`M ${50 - waist + 6} ${female ? 68 : 70} C 50 ${female ? 73 : 76} 50 ${female ? 73 : 76} ${50 + waist - 6} ${female ? 68 : 70}`}
            className="stroke-(--ink)"
            strokeOpacity="0.3"
            strokeWidth="1"
            fill="none"
          />
        )}
        {/* neck-base seam, since the outline now fills the neck */}
        <path d="M 42 8 C 44 11 56 11 58 8" className="stroke-(--ink)" strokeOpacity="0.3" strokeWidth="1" fill="none" />
        <circle cx="50" cy={lerp(60, 63, t)} r="1.1" className="fill-(--ink)" fillOpacity="0.3" />
        {female && <path d={braTop} className="fill-(--ink)" />}
        <path d={briefs} className="fill-(--ink)" />
      </g>
      <circle cx="50" cy="50" r="49.5" fill="none" className="stroke-(--border)" strokeWidth="1" />
    </svg>
  );
}

interface BodyFatPickerProps {
  sex: Sex | null;
  /** selected range midpoint, or null when nothing is chosen */
  value: number | null;
  onChange: (midpoint: number) => void;
}

export function BodyFatPicker({ sex, value, onChange }: BodyFatPickerProps) {
  const figureSex: "male" | "female" = sex === "male" ? "male" : "female";
  const ranges = rangesForSex(sex);

  return (
    <div role="radiogroup" aria-label="Body fat range" className="grid grid-cols-3 gap-x-3 gap-y-4">
      {ranges.map((r, i) => {
        const selected = value === r.midpoint;
        return (
          <button
            key={r.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(r.midpoint)}
            className="press group flex flex-col items-center gap-1.5"
          >
            <span
              className={`relative block aspect-square w-full max-w-24 overflow-hidden rounded-full transition-shadow duration-150 ${
                selected ? "shadow-[0_0_0_3px_var(--ink)]" : "shadow-[0_0_0_1px_transparent]"
              }`}
            >
              <Torso sex={figureSex} level={i} />
              {selected && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-(--ink)/55">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
                    <path
                      d="M5 12.5 10 17.5 19 7.5"
                      fill="none"
                      className="stroke-(--ink-contrast)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </span>
            <span className={`text-sm ${selected ? "font-semibold text-(--ink)" : "text-(--ink-2)"}`}>
              {r.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
