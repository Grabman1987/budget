# Wealth stages — owner addition, 2026-10-15

Status: implementation draft; conditional-stage approval decision pending. No production configuration has been written. PUB1 remains excluded.

## Contract

The existing allocation universe is reused. The target editor first lists eligible accounts and depots, including explicit inclusion/exclusion and the cash/account-only class. A depot and a separate settlement account are selected independently. Securities retain their dated exposure assignments and instrument opt-out. Selected negative cash reduces the investment sum; excluded wallets, everyday accounts and household reserves do not contribute to either the threshold or the cash share. Missing valuations never become zero. This metadata is current, not historically versioned: the editor explains its effect on live and historical allocation/risk/report/savings views.

Scope changes and the complete dated policy save in one transaction and audit group through the existing repository. Each edited account carries its previous scope and cash class; a concurrent change rejects the whole save. Existing account invariants, soft deletion, balances, bookings, locks, future target versions and grouped undo/redo remain. Invalid later account writes roll back earlier writes and the policy. No migration or production seed is introduced.

The UI accepts lower bounds, starting at zero: a stage entered as `500.000,00` begins at exactly EUR 500,000. Existing inclusive upper-bound storage is retained. Each previous bound is the next lower bound minus one cent. Loading a legacy policy displays the previous upper bound plus one cent, preserving its historical semantics exactly. A second stage at one cent is supported. Each stage has independently editable classes, integer basis-point weights totalling exactly 100%, and existing standard/custom bands.

The shared resolver remains authoritative for allocation, risk rules, reports and savings proposals. The optional stage label, condition text and enabled flag live in the existing policy JSON. Legacy absent flags remain enabled. Draft conditional behavior: a stage explicitly disabled is skipped in favor of the last enabled stage at or below the current wealth; the zero stage must remain enabled. Unknown wealth resolves no targets. A portfolio label distinguishes the active stage and a higher stage awaiting approval. Approval edits create a dated policy version through the existing editor.

## Editable example

The supplied workbook was read as data. Its private product/provider identifiers, sources, return assumptions and tax assumptions are not copied into code or Figma. The generic template requires four different, explicitly chosen existing asset classes. It creates no instruments, trades, standing orders or automatic sales. Existing instruments are assigned using the retained asset-class/exposure editor.

| From EUR | World | Leveraged equity 2× | Managed futures | Liquidity / short EUR assets |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 85% | 15% | 0% | 0% |
| 10,000 | 75% | 5% | 20% | 0% |
| 50,000 | 75% | 5% | 20% | 0% |
| 100,000 | 75% | 5% | 20% | 0% |
| 500,000 | 65% | 5% | 20% | 10% |
| 1,000,000 | 60% | 5% | 20% | 15% |
| 2,000,000 | 60% | 5% | 20% | 15% |

The final row is present in the workbook. The 70/10/20 alternative is not silently chosen. The EUR 400 / 340+60 contribution split is explanatory, not an automatic savings-plan mutation. Managed-futures approval, liquidity need and withdrawal planning remain explicit conditions. The owner has been asked whether conditional stages should await approval and retain the last approved targets; that answer is still required before delivery of this default. The draft template marks all conditional stages disabled.

## Verification and continuation

- Literal domain regressions: exact thresholds, one cent below, legacy round-trip, negative/unknown values, exact seven-stage weights and approval fallback.
- API regression: excluded wallet, signed selected cash, boundary-driven target, concurrent-edit rejection, rollback, grouped undo and redo with original balances unchanged.
- Browser regressions: existing shared-editor guards and future versions remain; new explicit class mapping, seven stages, German grouped amount, persisted request payload, conflict and discard. Both themes run the complete Axe check. One existing template selector is made exact because four new labels also include “Vorlage”.
- Figma: eight native source screens V18–V21 plus eight linked prototype screens in the existing file; no UI screenshot is imported as the design. Review starts at [Desktop](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-1865) or [Phone](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-2002). Conditional default remains labelled as a decision in the review screen.

Final command results, exact commit and next action belong in the accompanying handoff. Required exact-head CI, serial merge, main CI, automatic deployment and live revision proof remain delivery gates.
