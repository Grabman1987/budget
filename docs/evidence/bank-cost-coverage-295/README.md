# Bank-cost coverage disclosure — issue #295

This evidence covers the synthetic report 2.6 change on branch `codex/cost-coverage-295-1008`, based on main `3f527562fb96f4aedf401976eb620ef0fbb5d5db`. This baseline has the same application tree as the locally tested #225-compatible commit `7ede2a523d1be4be5c48ad8e4b644ad47d16d5d4`. PR integration, deployment and owner acceptance remain pending.

The headline calls the displayed sum “Erfasste Bank- und Zinskosten”. The amount remains the existing known subtotal: booked costs plus modeled loan interest where the existing inputs and FX conversion permit it. It does not add guessed costs. The detail now shows existing booked and modeled amounts separately. Beside it, the report says this is not the complete total burden, lists the current date separately from the closed-month period, counts currently used loans/cards/negative checking accounts without a stored rate, and counts last-twelve-closed-month account estimates with nonzero native interest that had no EUR rate on the existing monthly valuation date. A known zero-rate estimate is not treated as missing FX. It explicitly says that card/dispo interest is included only when booked, loan estimates require existing model inputs and EUR conversion, and TER and spreads are excluded. Report 4.5 and its separate portfolio period were not changed.

The API regression uses only synthetic records. RED was established independently for the missing current-conditions date, the omitted negative-checking/unknown-rate line, and the absent modeled-interest FX-period count. The FX fixture has a rate dated 2026-08-16, after the report’s existing 2026-08-15 valuation date; the missing-coverage count is one. A separate USD loan with an explicit zero rate confirms that a legitimate zero does not add a missing-FX period.

Validation logs:

- API RED: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-api-red2-1008.log` — 3 expected behavioral failures, 34 unrelated tests skipped; exit 1.
- UI RED: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-ui-red2-1008.log` — isolated-ledger report rendered, the requested visible unknown-rate disclosure was absent; exit 1.
- Focused API GREEN: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-api-green-1008.log` — all 8 small-ledger 2.6 cases passed.
- API 2.6 compatibility: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-api-domain-green-1008.log` — 11 matching report API cases passed.
- Existing DB report regressions: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-db-report-regressions-1008.log` — 19/19 passed.
- E2E build: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-e2e-build-green-1008.log` — exit 0.
- Final E2E build: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-final2-build-1008.log` — exit 0. Its UI and database report source hashes match the final browser run.
- Final full `npm run check`: `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-final-check-1008.log` — exit 0, 378 files / 3,491 tests, 942.56 seconds. It ran before a copy-only shortening of the PageFrame metric label and a documentation comment clarification; no calculations or tests changed afterward.
- After that label correction, `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-final-copy-build-1008.log` records `npm run build:e2e` exit 0, and `C:\Users\fabia\AppData\Local\Temp\budget-cost-coverage-295-final-copy-browser-1008.log` records the final desktop/mobile report suite, 9/9 passed. The browser log records the current source hashes and capture directory. Both themes still pass serious/critical Axe and horizontal overflow checks.
- Scoped ESLint, Prettier and `git diff --check` passed after the final copy correction.

Actual coverage captures from the final passing 9-test run:

- `light-desktop.png` — SHA-256 `78F46C135E01BAF8F60898B30C3143582B303E5E0C69852C3700F40CA6366C8A`
- `dark-desktop.png` — SHA-256 `0B58E000CB71BA3CA9680B0C25A21B380453F536156F9656B9DD2521F0B22FCB`
- `light-mobile.png` — SHA-256 `BAE58A2E615F21D367F17D04A7115684DEAC84CD8832102BAD728CCE94D21C26`
- `dark-mobile.png` — SHA-256 `75F7E921CEEC2D935D035B8933F413E374C941DE97ABA5A80CF8C33E042DBC27`

Independent source review and the lead's final source, log and refreshed visual review found no remaining task findings. The full repository check and the scoped copy follow-up above passed; PR CI and live delivery remain pending. This synthetic evidence does not establish the completeness of any real person’s costs or credit terms.
