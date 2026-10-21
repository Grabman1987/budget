# #577 — proposed three existing UI test adapters

Outside-only proposal against exact03d421b5685ed6703e63fd41ca98757b6428dce6. Not approved, applied or executed. Root owns the existing-test policy and adoption decision. No test/config/timeout/runtime change occurred.

The public issue577 Scope explicitly requires: “Lead figure \"Saldo Budget-Konten\" plus \"X von Y Konten geprüft\" linking to Konten › Prüfen; no Nettovermögen hero on this page”, and “List instead of cards … Name · Prüfbadge ·30-day sparkline … Saldo at the right.” These supersede readiness tied to the removed net-worth hero. Approved source contract698806a1 additionally moves existing metadata/date/bank/limit facts into an accessible Details disclosure; no date policy or financial result changes.

| Existing path | Proposed exact adjustment | Preserved purpose |
| --- | --- | --- |
| e2e/account-order.spec.ts | One readiness test ID: net-worth → budget-accounts-balance; same toBeVisible | All seeded cents/IDs, group membership, button/drag/keyboard order/focus, real Undo, reload/select persistence, Axe and existing project limits remain byte-exact. |
| e2e/sidebar-zerosum.spec.ts | Same one readiness ID replacement | Same exact signed group sums/negative colours, account IDs, collapse/persistence/navigation, 44px checks, light/dark/Axe, exact1234-cent save and Undo; readiness never asserted a net-worth numeric value. |
| apps/web/src/ledger/account-review.test.tsx | After existing first-link wait, click the six actual Details controls by their exact existing account IDs/names | Every original full date/text/count/class assertion and subsequent manual12501→15002→12501 Save/Undo path remains verbatim. No added wait budget, changed clock, fixture, mock or predicate. |

Source feasibility correction independently verified:03d421b5 originally placed full check.text in a plain Details dd. Root separately requested preservation; the author now adds ONLY className={check.stale ? 'is-stale' : undefined} to that actual dd (page SHAb64dbbd58045ecc9a8c377afa767682cf8832a36a195776e92e80a209fc990a4). Exact one-line inverse verified; no kcheck/nowrap/layout rule is added. This closes the source contradiction while all four original stale/quiet/fresh date-class assertions remain unchanged in the proposed test. No class is synthesized by the test. Product-class preservation is separate from approval/adoption of these OLD adapters.

MANIFEST.json pins whole before/after files and patch. Mechanical inverse removes only the added six-click loop / restores the two readiness tokens and recovers each entire committed file exactly. Existing skipped-project declarations are unchanged; no skips are introduced. This is proposed source compatibility, not evidence of browser fit, test performance, financial correctness or a passing run.
