# UX-6: typography and radii (owner task 2026-10-05)

Application CSS and shared UI primitives now use the nearest DESIGN.md scale
steps for off-scale font sizes and corner radii. Font ties choose the larger
normal text step (13 -> 14); radius ties choose the smaller step (7 -> 6,
10 -> 8, 14 -> 12). Existing responsive tokens retain their phone overrides.

The generator now exposes the sizes already listed in the typography hierarchy:
class tags 11, strong chart labels 13, solitary figures 34, panel figures 36,
and booking figures 44 px (36 on the phone). No new design scale was invented.

`node packages/ui/scripts/check-css-scale.mjs` scans all application/shared CSS.
It runs in `npm run lint`, hence Linux and Windows CI. Unit regressions cover
font shorthand, compound/individual corner radii, comments and exact chart
exceptions. Drawing geometry is outside the checked properties; the existing
1 px chart/legend marks and emoji glyph sizes have narrow selector exceptions.
The check uses the generated scale, whose existing tests compare it to DESIGN.md.

Browser regressions cover the cascade at 1440/390 px in light/dark themes,
responsive body text, hero/button radii, print labels, chart labels and marks.
A synthetic positive-hero GET response exercises the distribution button without
writing sample-server data. Full local screenshots are artifacts under test-results;
none replace Linux baselines.

## Affected Linux baselines

Review the existing images in all seven affected baseline suites (both desktop
and phone; all light/dark and panel variants present in each directory):

- `e2e/auth.spec.ts-snapshots/` (field labels and recovery text)
- `e2e/components.spec.ts-snapshots/` (shared primitives and chart legends)
- `e2e/shell.spec.ts-snapshots/` (shell, Heute and report catalog)
- `e2e/networth.spec.ts-snapshots/` (wealth labels and figures)
- `e2e/rules.spec.ts-snapshots/` (rule metadata)
- `e2e/goals.spec.ts-snapshots/` (goal table labels)
- `e2e/expected.spec.ts-snapshots/` (payment tables, labels and dialog)

No screenshot baseline was regenerated locally. Windows visual assertions are
annotated as skipped by the existing Linux-only comparison helper.

## Local evidence and focused verification

Viewport crops from the synthetic browser regressions:

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop 1440 | [Plan](evidence/ux-typeset-1005/plan-light-desktop.png) | [Plan](evidence/ux-typeset-1005/plan-dark-desktop.png) |
| Phone 390 | [Plan](evidence/ux-typeset-1005/plan-light-mobile.png) | [Plan](evidence/ux-typeset-1005/plan-dark-mobile.png) |

The focused scale/token/component unit run passed 26 tests. The final scale E2E
run passed 7 tests including setup; existing component E2E checks passed 24 with
one intended desktop skip. Linux pixel assertions are annotated as skipped on
Windows. Production and E2E builds passed. Full check results are recorded in the
PR; CI and pinned Linux baseline review remain separate gates.

The full `npm run check -- -- --maxWorkers=2` passed (exit 0): all workspace
typechecks, CSS lint, ESLint, Prettier, and 3,251 unit/API tests in 351 files.
The full unit phase took 809.40 seconds. No unit rerun or timeout/assertion change
was needed. Final focused browser rerun: 7 passed (1.7 minutes).

## Owner steps

Review the affected baselines in the pinned Linux environment and typography on
desktop/phone in both themes. No keys, consents, migration or provider setup.

Worktree HEAD/index writes are denied in this environment. Delivery therefore
uses the ignored `node_modules/.cache/ux6-delivery.git` directory and the requested
`codex/ux-typeset-1005` branch. The original worktree HEAD still names
`codex/ux6-scale-1005`; synchronize it once Git metadata is writable again.
