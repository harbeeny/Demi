#!/usr/bin/env python3
"""WCAG AA gate for the theme palettes in src/app/globals.css.

Run after any token change: python3 scripts/check-contrast.py
Text pairs need >=4.5:1; meaningful graphics/controls >=3:1.
"""
import re, sys, pathlib

CSS = pathlib.Path(__file__).resolve().parent.parent / "src/app/globals.css"

def parse_block(src, header):
    block = src.split(header, 1)[1]
    block = block[: block.index("}")]
    return dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", block))

def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

TEXT = [  # >= 4.5
    ("ink", "surface"), ("ink", "bg"), ("ink-2", "surface"), ("ink-2", "bg"),
    ("muted", "surface"), ("muted", "bg"), ("tint-ink", "tint"),
    ("tint-muted", "tint"), ("accent-text", "bg"), ("accent-text", "surface"),
    ("warn-ink", "warn-bg"), ("danger-ink", "danger-bg"), ("ink-contrast", "ink"),
]
UI = [  # >= 3.0
    ("accent-strong", "surface"), ("over", "surface"), ("macro-carbs", "surface"),
    ("macro-protein", "surface"), ("macro-fat", "surface"), ("flame", "surface"),
    ("accent-deep", "surface"), ("focus", "surface"),
]

src = CSS.read_text()
fails = 0
for name, header in [("light", ":root {"), ("dark", '[data-theme="dark"] {')]:
    p = parse_block(src, header)
    for pairs, need in ((TEXT, 4.5), (UI, 3.0)):
        for a, b in pairs:
            if a not in p or b not in p:
                print(f"{name}: missing token {a} or {b}"); fails += 1; continue
            r = ratio(p[a], p[b])
            if r < need:
                print(f"{name}: FAIL {a} on {b} = {r:.2f} (need {need})"); fails += 1
print("ALL PASS" if fails == 0 else f"{fails} failures")
sys.exit(1 if fails else 0)
