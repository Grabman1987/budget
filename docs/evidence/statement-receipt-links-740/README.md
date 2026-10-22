# Manual statement receipt links — issue 740

Account-local document review now lets the owner select existing same-account, same-currency bookings and attach or detach the retained original PDF. It displays current links, exact booking identities, dates, descriptions and signed amounts. It never infers a match from an amount or creates a payment. Several documents and bookings can share links; automatic import pairs remain protected.

## Source and authorization

The seven product files were reconstructed from the preserved owned patch `aac07204a865f53fff36afa8e5ebae8b498da9e4` and its two strict-optional-property integration patches `1d0c7b1a` / `221e607c`. The immutable [handoff](../../handoff/740-statement-receipt-links/README.md) comes from archive commit `043b7d28e127782597fb97a96650c5545a22700f`. Its historical preparation-only authorization is retained as provenance; the owner's direct 22 October instruction authorizes continuation and protected serial delivery under [the current process](../../queue/README.md). PR719/feature626 remains stopped.

The reconstruction used a separate Git index, checked each before/after blob, and applied only these owned patches. All four formatted original bases matched current live Main `331bf3750341e0ad90f2392a2290160c6149bafb` exactly; the three new files did not exist. The seven final product files equal the formatted reconstructed sources. See [reconstruction](reconstruction.json) and [adoption](adoption.json). No mixed historical branch or capsule was merged, and no schema, financial writer, generic receipt API or audit implementation changed.

## Acceptance checks

- New DB tests cover n:m links, exact financial-table equality, actual grouped Undo/redo, active/absent no-ops, source and target conflicts, booking/split/pair/account ABA, currency and account mismatches, independent paging and literal wildcard searches.
- New authenticated API tests cover original-byte download, multi-link and replay, actual API Undo/redo, session/origin protection, missing and same-size-corrupted source bytes, target changes during asynchronous file verification and strict bounded input.
- New component tests cover frozen source/target tokens, retained choices across search and actual pagination, explicit discard, conflict preservation, one POST, busy controls, no fake Undo on no-op, protected pairs and amount privacy. The parent integration also checks cancelled close and navigation/sibling blocking while a link write is pending.
- New browser cases use an isolated real server/database and synthetic PDF, perform upload, select/discard, attach, detach, actual group Undo/redo and original download, verify exact financial state, keyboard control, 44px targets, viewport/center hit ownership, Axe, overflow and amount privacy in both themes. Browser results and original captures are recorded below after execution; no physical-device certification is implied.

## Existing-test adaptations

| File | Reason and preserved coverage |
| --- | --- |
| `packages/db/src/repos/statement-automation-741.test.ts` | Adds one scenario: every managed original/refund/settlement pair is visible and protected, mixed batches abort before writes, already-attached pairs remain audit-free. All prior assertions remain. |
| `apps/web/src/statement-intake/statement-review-726.test.tsx` | Adds a valid empty links GET fixture and scopes the document reload button to its document action container instead of positional `[0]`. Existing CAS/discard/financial assertions remain; one additional scenario checks link dirty/busy coordination. |
| `apps/web/src/statement-intake/statement-automation-741.test.tsx` | Adds only the new empty GET response. All automation expectations remain. |
| `apps/web/src/statement-intake/statement-settlement-727.test.tsx` | Extends the finite read whitelist only for the two known intake IDs and exact initial `offset=0`, `attachedOffset=0`, `limit=25` query. The matching A/B original identity/hash/revision is returned. All write budgets, unexpected-request checks and financial/Undo expectations remain. |

No test tolerance, timeout, retry, skip, protected oracle or CI setting was changed. The independent reviewer inspected the complete source and each adaptation.

## Verification record

Local execution by the implementing agent; independent review by a separate agent `/root/review_pr753_resolution`.

- Initial DB run: 14/14 passed.
- Initial combined new/API/UI and old-neighbor run: 43 passed, one old726 positional reload selector failed; diagnosed and scoped as above.
- Workspace typecheck found only unsupported `exact` options in newly written Testing Library role queries; removed because string role names are exact by default. The other workspace checks passed; Web rerun passed.
- Next targeted run: 77 passed, 15 old727 finite-transport checks failed on the added GET. After the exact fixture adaptation, old727 passed 15/15 separately. These are distinct runs, not a fabricated single 92/92 run.
- Final scoped ESLint and Prettier passed, including the old727 fixture and new browser spec.
- Fresh E2E build passed. Initial browser run: three setup passes and six failures because the new fixture used a checking account with the existing card-only eligible-upload contract. Second run: three setup passes and six failures because the new `has` locator incorrectly searched for an ancestor dialog inside the details panel. Only the new fixture account type and relative summary locator were corrected; product and assertions were unchanged. The subsequent desktop-light diagnostic passed 4/4 including setup in 28.9 seconds.
- Final desktop, Chromium mobile and native WebKit iPhone run: **9/9 passed in 1.3 minutes**, three setup cases plus two themes for each of the three profiles. No skips, retries or changed deadlines. Native WebKit cases took 13.0/13.1 seconds, within the unchanged 30-second test limit.
- Independent whole-diff HIGH and final source/test/provenance delta reviews: CLEAR. All seven product files remain identical to adoption; all ten historical archive files are byte-identical to the pinned archive, with its nine-entry manifest verified. Exact-head CI and live delivery remain pending until recorded in the PR.

## Original browser captures

All six untouched PNGs were visually inspected by the implementing agent; hashes and sizes are in [the manifest](browser-manifest.json). The corresponding JSON files record actual source/booking IDs, signed amounts, unchanged financial state and measured hit geometry. These are full-page captures: content below the current viewport can include the underlying page outside the modal's viewport-height surface. The ordinary Redo toast is visible and can overlap scroll content; hit testing was performed after normal scrolling at each exercised control. The evidence does not claim every control is simultaneously visible or that a physical phone/keyboard was tested.

| Profile | Light | Dark |
| --- | --- | --- |
| Desktop Chromium | [PNG](desktop-light.png), [measurements](desktop-light.json) | [PNG](desktop-dark.png), [measurements](desktop-dark.json) |
| Phone Chromium | [PNG](mobile-light.png), [measurements](mobile-light.json) | [PNG](mobile-dark.png), [measurements](mobile-dark.json) |
| Native WebKit iPhone | [PNG](webkit-iphone-light.png), [measurements](webkit-iphone-light.json) | [PNG](webkit-iphone-dark.png), [measurements](webkit-iphone-dark.json) |

Historical raw logs and reconstruction inputs are retained under the local delivery evidence directory. Public artifacts contain synthetic data only. The feature does not claim to have linked the owner's private historical archive; that operation and payroll automation are separate.
