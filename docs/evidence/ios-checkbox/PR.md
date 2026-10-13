## Problem

On iPhone Safari every checkbox rendered as a giant (about 44 px) black rounded square (dark theme, Plan › Monat). The phone accessibility floor in `base.css` (`min-width/min-height: var(--touch) !important` on all inputs) also enlarged `input[type=checkbox]` and `input[type=radio]`, and WebKit then draws a huge native control.

## Change

- One drawn checkbox/radio app-wide (`packages/ui/src/styles/components.css`): `appearance: none`, a 20 px box (`--radius-xs`, 1.5 px `--ink-3` border, `--surface` fill); checked = `--line` fill with a drawn check mark (radio: round with inner dot); indeterminate dash, hover, disabled, forced-colors and a focus-visible ring on the drawn box (not on the hit area).
- The input element keeps its 44 px box on touch (transparent) and 20 px on a fine pointer; the visible box is drawn centred inside it via `::before`/`::after`. No tap-target assertion was changed.
- Removed the page-level `width`/`height`/`accent-color` overrides on checkboxes (assignment, auth, plan-year, ledger, inflation basket/explorer, reports-future, rules) that would fight the shared size. Plan files are untouched.
- New `e2e/checkbox-appearance.spec.ts` on desktop, mobile and real-WebKit `webkit-iphone`: drawn box about 20 px, hit area at least 44 px on touch, tap toggles and fills, light/dark Axe clean.

Evidence (synthetic data): `docs/evidence/ios-checkbox/`.

## Verification

Local: new spec on all three projects; tap-targets, plan-ghost, plan-inspector, rules, ledger, inflation-explorer (desktop, mobile, iphone) and bank-followups/bank-inbox-bulk pass; `check-css-scale` clean.

Expected `toHaveScreenshot` differences against `*-linux.png` baselines (visual change, baselines not regenerated here): see the CI comment.

Refs: iOS Safari checkbox rendering report (owner screenshot, 13.10.2026).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
