

## #584 — Capture line transition and stale remainder feedback

- [x] NEW real isolated-ledger one → two → one regression: one gross field, exact 1-cent remainder refusal including Ctrl+Enter, unchanged 1000-cent head total after removal, one stored split of −1000 cents and public Undo.
- [x] Literal UI odd cents: −1000 → −334/−333/−333, real API and SQLite readback; both Save/Undo paths restore the literal 100000-cent account balance.
- [x] Exact local stale remainder-save feedback is suppressed only after current split validation clears; unrelated errors, financial rules, save guards and writers remain unchanged. No existing test changed.
- [x] Corrected source `3a1210cc`: actual WebKit 7/7 in 81.135s (three setup + four feature cases), desktop 1440×900/configured iPhone 390×664, both themes, scoped Axe, phone44px and no horizontal overflow. [Four byte-identical one-after originals and limits](evidence/capture-transition-584/README.md).
- [x] Root reviewed all four corrected one-after originals and two odd-cent originals. The first functional PASS / visual HOLD for stale red feedback remains retained; corrected originals remove that defect.
- [ ] Required full check and normal production build on the frozen source, exact-head Chromium/required CI, serial integration and verified LIVE.

The body scrolls; screenshots do not claim every split row is visible at once.
Physical-device/keyboard/fullscreen acceptance belongs separately to #586.
