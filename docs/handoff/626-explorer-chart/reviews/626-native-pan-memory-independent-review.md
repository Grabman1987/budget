# 626 native pan-memory review

Independent read-only review; no functional tests, browser, formatter or source writes performed.

## Actual browser evidence

`626-selector-corrected-canonical-native-second-actual/result.json` and raw canonical-native.log record whole33: 29 passed, 4 failed, 4.7m. All four custom phone configured/844 light/dark fail the unchanged strict native line315: measured before-switch47, after Table0. Other24 fixed-template cases, two custom desktop cases and three setup pass. Native/wrapper exit1, source/process guards0, reused compiled167; this is a meaningful product regression, not a selector or JSDOM finding. Historical successful fresh build21356 is reused; no second fresh-build claim.

## Source-supported mechanism and bounded proposal

The inspector records horizontalPosition only in useLayoutEffect cleanup by reading a captured native scroller. During the same mode transition its parent is hidden and the active/inactive ChartValues key replaces the native subtree. A hidden/disconnected element may report zero without its former CSS box. This explains a credible loss mechanism; exact React commit/callback ordering and connected state at cleanup were not instrumented, so the browser failure alone does not prove that precise ordering.

After the requested unit RED, a bounded local fix can record live scroll events on the actual root-owned .ex-scroll/.ex-template-scroll element while active, retain its raw offset, and restore it on activation. Filter event.target itself (not closest) and root ownership/connection, avoid unrelated nested scrolls, do not preventDefault or alter shared widgets. Remove cleanup overwrite. Retain the active key because it clears stale chart/table tooltip state. No finance formulas, native table actions, privacy, query readiness or export behavior should change.

## NEW literal regression: HIGH STATIC CLEAR

Source freeze e82295716e03fc7a17f8f1005ecb127dfa43c3cb2bf4207d769df591fd2963ca at HEADcb087a2639f5e367aa3af4aa2b692725f169e76c contains only an appended top-level test in the author's NEW explorer-toggle-626.test.tsx. The entire original file prefix is byte-exact prior499; append equals the outside proposed block modulo surrounding whitespace. Other3435 source hashes and all3436 modes are unchanged; all current source hashes match. Inspector SHA91cd6322693acf655faa2795783e1689b9cf39080a013ea7a768b5ec26d86f54 remains unpatched.

The test uses actual ExplorerReportPage and its mode controls; a local scrollLeft accessor reports zero only for the old hidden/disconnected box, with a real scroll event at literal47 before changing modes. It demands zero while the old box is hidden and exact47 on the active native region after returning, plus the original account/category link. No global mock, arbitrary wait, timeout, financial expectation or old-test change. It does not prescribe event-capture implementation: a valid DOM-preserving repair may also pass. This is an independent CSSOM boundary stress, not native pan proof. Its first actual outcome must be retained, including an unexpected GREEN; it has not been run by this reviewer.

Root's already granted single-title RED may proceed. Any production patch needs a separately frozen bounded review and later real native verification. Public/CI/live gates remain open.
