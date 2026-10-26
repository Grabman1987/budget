# Issue 471 icon consistency handoff

Scope: use the documented warning, error, success, clock, transfer and area icons; normalize these icons to 16, 20 or 24 px with the corresponding stroke; replace visual Unicode controls; give class swatches 12 px shapes and visible B/W/Z abbreviations; show the booking confirmation state beside its icon. The capture status remains the same controlled button with its existing `aria-pressed`, cash lock, click handler and save path.

Native `details` retain their native keyboard and disclosure behavior. Shared CSS replaces their browser marker with the Lucide ChevronRight shape and rotates it when open. Summaries with an explicit SVG or capture caret keep their own icon.

Existing test adaptations (technical presentation only):

- `apps/web/src/budget/plan-menus.test.tsx`: menu text no longer contains the visual triangle; menu actions and focus behavior remain asserted.
- `apps/web/src/ledger/capture-form.test.tsx`: the split button's accessible name loses the visual triangle, and the confirmation button now has visible status text. Existing status and saved booking assertions are retained.
- `apps/web/src/ledger/split-editor.test.tsx`: the split button's accessible name loses the visual triangle; allocation expectations are retained.
- `apps/web/src/month-close/stepper.test.tsx`: locate the unchanged “nichts offen” text without the visual check glyph; step behavior stays asserted.
- `apps/web/src/month-close/month-close-page.test.tsx`: locate the unchanged “nichts offen” text without the visual check glyph; close behavior stays asserted.

Local light checks: Node 22.23.3 preflight passed; scoped Prettier and ESLint passed; CSS scale check passed; the five affected Vitest files passed (30 tests); the Plan menu test passed again (9 tests) after the selected-item icon update; `git diff --check` passed. Browser acceptance remains to be checked on desktop 1440, Chromium mobile 390 and WebKit iPhone in both themes, including axe, horizontal overflow and 44 px touch targets. Capture synthetic desktop light and iPhone dark evidence in `docs/evidence/icons-471/` before PR delivery.
