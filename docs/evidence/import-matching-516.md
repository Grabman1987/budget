# Import matching audit and review evidence (#516)

The owner decision of 21 November 2026 retires ordered identical-group pairing and nearest/input-order singleton arbitration. An automatic link requires both one eligible booking and one bank line claiming it. Ambiguity stays open across refresh and provider revisions until the owner chooses. The review preselects the most recently confirmed eligible booking using its audit transition. Equal or unavailable confirmation times use nearest calendar day, then stable booking ID. A suggestion does not write anything.

| SPEC-004 acceptance | Synthetic proof |
| --- | --- |
| AC-004-01 | `service.test.ts`, “keeps identical provider references on different accounts separate and filters before pagination”; source identity and per-account posting stay distinct. |
| AC-004-02 | `service.test.ts`, “keeps identical purchases without ids, deduping the next complete window”; repeated fallback ordinals converge on the same candidates. |
| AC-004-03 | `bank-matching-516.test.ts`, “requires exact signed cents, account and currency for links and suggestions”; `service.test.ts`, “links at the edge of the window, but not five days away”. |
| AC-004-04 | `bank-matching-516.test.ts`, “keeps both singleton claims ambiguous, regardless of input order”; `bank-sync.test.ts`, “keeps isolated identical groups open without ordered pairing”; `service.test.ts`, “keeps identical groups open, ranks by confirmation, and restores a choice with one Undo”; `bank-matching-516.test.tsx`, “ON explains source, five-day suggestions and ambiguity without writing on selection”. |
| AC-004-05 | `service.test.ts`, “rolls back a failed automatic link and retries the 21-day overlap without advancing its watermark”. |
| AC-004-06 | `service.test.ts`, “warns on changed confirmed history once, preserving the candidate, booking and decision”; open ambiguity also survives an incoming revision. |

The service tests verify that the two singleton claims remain open with one original booking and 98,799 cents. The multiple-booking test retains both candidates and 97,598 cents on suggestion, rejects linking the same booking twice, and restores the chosen booking and inbox item with one Undo. Existing unique links and the four-day automatic/five-day review windows remain covered.

Fallback keys still depend on the complete batch's reference population and occurrence ordinals. Changed pagination or source populations can affect the keys. Wider operator migration/revert, rule and bulk matrices, and privacy-error acceptance remain outside this slice (AC-004-07 through AC-004-11).
