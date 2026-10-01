---
name: budget-impeccable
description: Audit and polish Budget UI against its existing Blaupause design, accessibility rules and prototype, adapted from the owner's Impeccable catalogue description.
---

Use for UI review and implementation. This is a local adaptation; it does not install upstream slash commands or a deterministic 60-rule engine.

1. Read `SPEC.md`, `DESIGN.md`, `.impeccable/design.json` and the matching prototype/screen. Preserve the source precedence. Do not run a generic design initialization or invent a new identity.
2. Review typography, hierarchy, token use, spacing, responsive behavior, motion and German microcopy. Use Archivo/Barlow, tabular figures, existing color/spacing tokens, title blocks, registers and parts lists. Keep red for action needed and the specified hatching/line semantics.
3. Check keyboard navigation, visible focus, semantic controls, labels, dialog focus/return, contrast, at least 44px interactive touch targets, reduced motion and light/dark modes. Color alone must not convey status. Accessibility fixes still need comparison with the design reference.
4. Review empty/loading/error states, long names and signed/large/cent-boundary amounts. Every financial figure must use the shared calculation and appropriate de-AT formatting.
5. Report each finding with location, user impact, evidence and a minimal proposed correction. Use existing components; avoid decorative cards, shadows, accent side borders and heading eyebrows.
6. Validate relevant flows at desktop 1440 and mobile 390 and run required functional/visual checks. Classify browser-version mismatches explicitly. Do not replace screenshots merely to turn failures green.

Polish only the requested area. Generic OKLCH/grid preferences do not authorize changing the project's tokens, prototype or product scope.
