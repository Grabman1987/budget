# Rules keyboard focus evidence (#226)

**Scope:** Optimistic rule switches keep keyboard focus when a rule moves between groups. The original focused review used `dfaa953ca2a3a2e2d217cae5725c03a0a90c6ed0`. The normal union with main `788b15150f7cfbe27077660a09f92944e08377bb` is now `bfa75397a7ce0f063614635d04af8d70cffa7b6d`. Both source files retained their SHA-256 hashes through that union and the browser run. Git normalized only the evidence file's final CRLF to LF; its restored content matches the retained safety stash. The task changes were uncommitted during that browser preparation; the final check and later history union are recorded below.

The checked #280 head `7ac80a2a7405cd2ec18750b78bef3fbafc9f6e76` was normally unioned as `c7a48103461af9db2f6ffa113689f0a69f58734e` before this final check. That parent adds only measurement scripts and documentation, with no application change. Both focus source files and all four current captures retained identical SHA-256 hashes. Safety stash `951b99871c13297e70f00afeb2672a997220135f` is retained. PR #381 is now merged; its Main validation/deployment is still pending at this publication. This records a prepared source union, not a #280 live claim. The existing rules browser evidence therefore covers the unchanged application source.

## Verification

- **RED:** `R15 off changes…` failed before the fix: after Space switched R15 off and its row moved into the collapsed disabled group, focus was lost instead of moving to the group summary. Log: `%TEMP%\budget-rules-226-keyboard-red-1009.log`.
- **GREEN:** `e2e/rules.spec.ts --project=desktop --workers=1 --grep 'R15 off changes'`: 4 passed, including 3 setup checks (43.6s, exit 0). Log: `%TEMP%\budget-rules-226-keyboard-green-1009.log`.
- Scoped web typecheck, ESLint, and Prettier: exit 0. Log: `%TEMP%\budget-rules-226-focus-scoped-1009.log`.
- Fresh build: exit 0. Log: `%TEMP%\budget-rules-226-focus-build-1009.log`.

The passing keyboard flow verifies Space OFF → disabled summary receives focus; Undo restores the rule and counts; Space OFF → Enter expands the disabled group → Space ON leaves focus on the enabled-group switch. The same E2E also confirms the R02 threshold write/Undo path and that Escape from its settings dialog restores focus to its trigger.

## Full rules browser preparation

On the normal main union, a fresh E2E build passed, followed by all of `e2e/rules.spec.ts` on desktop and mobile with one worker: 13 passed (including three setup checks), four intentional skips, 1.4 minutes, exit 0. The skips are the phone-target case on desktop and three shared-state write cases on mobile, which execute once on desktop. Logs: `%TEMP%/budget-rules-226-main788-build-1009.log` and `%TEMP%/budget-rules-226-all-rules-ui-1009.log`.

The run covers rule values/thresholds/correction links, collapsed disabled rules, both themes with axe, threshold status/next steps, 44-pixel phone targets, the financial-check count and threshold mutations/undo, owner-confirmed book-rule states, and switch/threshold undo. Root inspected all four current 1440×900 / 390×844 Chromium captures below. These Windows captures are separate from the later Linux pixel-baseline CI and physical iPhone Safari acceptance.

| Capture                                                             | SHA-256                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Desktop light](rules-focus-226/browser-captures/desktop-light.png) | `256334853080CF345E52365C17B7193C358E66988129DB4D3723E4C97750BECC` |
| [Desktop dark](rules-focus-226/browser-captures/desktop-dark.png)   | `83F37FBD1BB96A4D00F53623414437BAA258D0F56B63884768AD9ECAC40BC19B` |
| [Mobile light](rules-focus-226/browser-captures/mobile-light.png)   | `4A7223E27DEC90ED782D14E204D0BBDF902548DEC7E562B6ED111E5934852CE3` |
| [Mobile dark](rules-focus-226/browser-captures/mobile-dark.png)     | `133C70F70AEEC7289690EA405AB89EF07013649C86EFA55A4A8F9CEC6C24E8B8` |

## Remaining gates

The final repository-wide check passed: all workspace typechecks, lint/format and 380 test files / 3,508 tests, exit 0; Vitest duration 1,041.54 seconds. Immediately afterward all 2,125 frozen source paths and SHA-256 hashes matched. Log: `%TEMP%/budget-rules-226-final-union-full-check-1009.log`; proof: `%TEMP%/budget-rules-226-final-union-proof-1009.json`.

The subsequent normal history union with merged main `410d2cd0a03df6e0f802b5d98741f259fd96ad36` produced `698706af18f21f820b3764fa2999f98b7fa67b83`. Its committed tree stayed identical; after restoring retained safety stash `1f94956f4fddcddfa7bf65924f29834597d998c8`, all 2,125 paths/hashes still matched. Only documentation is updated after that proof. Both focus source files and the four current captures remain unchanged.

Root also inspected the four existing light/dark desktop/mobile Linux baseline files listed in [the original scope](../ux-rules-first-1005.md). They show the intended grouped rules, collapsed disabled group and input controls. This inspection does not replace comparison against a fresh Linux CI run; no baseline was regenerated or accepted from an unexplained diff.

Original PR head publication, exact-head CI (including Linux pixel baselines), deployment and owner acceptance remain pending. No issue is closed by this evidence.
