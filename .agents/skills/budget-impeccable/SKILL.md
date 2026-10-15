---
name: budget-impeccable
description: Audit and polish Budget UI against its existing Blaupause design, accessibility rules and prototype, using the owner-requested Impeccable source.
---

Use for UI review and implementation. This is a local adaptation; it does not install upstream slash commands. The original Impeccable skill was read at commit `abf5779cabc20147fd9c013fa4705088c200bf8a` (Apache-2.0): [source](https://github.com/pbakaus/impeccable/blob/abf5779cabc20147fd9c013fa4705088c200bf8a/plugin/skills/impeccable/SKILL.md).

1. Read `SPEC.md`, `DESIGN.md`, `.impeccable/design.json` and the matching prototype/screen. Preserve the source precedence. Do not run a generic design initialization or invent a new identity.
2. Review typography, hierarchy, token use, spacing, responsive behavior, motion and German microcopy. Use Archivo/Barlow, tabular figures, existing color/spacing tokens, title blocks, registers and parts lists. Keep red for action needed and the specified hatching/line semantics.
3. Check keyboard navigation, visible focus, semantic controls, labels, dialog focus/return, contrast, at least 44px interactive touch targets, reduced motion and light/dark modes. Color alone must not convey status. Accessibility fixes still need comparison with the design reference.
4. Review empty/loading/error states, long names and signed/large/cent-boundary amounts. Every financial figure must use the shared calculation and appropriate de-AT formatting.
5. Report each finding with location, user impact, evidence and a minimal proposed correction. Use existing components; avoid decorative cards, shadows, accent side borders and heading eyebrows.
6. Validate relevant flows at desktop 1440 and mobile 390 and run required functional/visual checks. Classify browser-version mismatches explicitly. Do not replace screenshots merely to turn failures green.

Polish only the requested area. Generic OKLCH/grid preferences do not authorize changing the project's tokens, prototype or product scope.

For the original CLI, inspect its pinned launcher, keep `IMPECCABLE_HOME` in the cloud workspace, and run `context --target <file>` once per task. Apply the relevant `quieter`, `adapt` and craft-floor guidance to the existing design. After UI edits, run `detect --json <changed-targets>` once when the inspected engine is available; record its output and investigate relevant findings. The launcher verifies its engine checksum. Never call a detector result a complete accessibility or browser check, and do not reinitialize the existing design. Required project regressions still must be resolved even if a generic polish timebox has elapsed.
