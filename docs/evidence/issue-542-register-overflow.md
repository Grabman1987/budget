# Account-register overflow — #542

Base: `5b7cd32b`. Local Linux Chromium; synthetic sample ledger only.

The overflow recorded by CI run `39005388677`, shard 1, no longer reproduces on
current main. The original account table used intrinsic column sizing. Commit
`8756bad3` (#581 / #674) subsequently introduced the account-only fixed table,
explicit column widths and bounded text. The register now measures 1122 px inside
its 1124 px card at a 1440 px viewport. With 100 booking rows and fonts loaded,
both light and dark modes retain a 1440 px document width while the reconciliation
badge has keyboard focus. No source layout change is needed.

`e2e/fab-focus-q5.spec.ts` removes the obsolete desktop overflow exception. The
existing detail scenario also waits for the account rows and fonts, then tabs
from the current first action (capture) to the reconciliation badge. This retains
the original reported focus case and its visible-focus checks. The same strict
viewport-width assertion now applies to every detail route and profile. Financial
expectations, tolerances, timeouts and Axe assertions are unchanged.

Validation:

- One `npm run build:e2e` passed; no rebuild was needed for test-only edits.
- The restored existing desktop scenario passed before the extra focus coverage
  (4 passed including setup, 46.8 seconds).
- Final existing detail scenario passed on desktop 1440 (31.3 seconds) and
  Chromium phone 390 (26.0 seconds), covering light/dark, all seven detail routes,
  focus and Axe checks. The single invocation reported five passes including
  setup and one infrastructure failure in 1.1 minutes.
- Native WebKit iPhone 390 was blocked at browser launch by absent
  `libgtk-4`, `libgraphene`, `libharfbuzz-icu`, `libmanette`, `libhyphen` and
  `libGLESv2`. The provisioned tools directory contains no extracted replacements;
  no repeated launch or browser substitution was attempted. WebKit remains a CI
  acceptance gate. The supported provisioning script requires root; this session
  runs as UID 1000 and has no `sudo` executable. A project-local
  `playwright install-deps webkit --dry-run` also fails because the available apt
  metadata cannot locate the required packages. A privileged setup phase or the
  canonical GitHub CI environment is required for native WebKit verification.
- Changed-file ESLint, Prettier and `git diff --check` passed.

No application code, money calculations, write paths, security settings or visual
baselines changed. No full suite, publication or physical-device test is claimed.
