# Explorer templates — #625

Four fixed templates sit beside saved Explorer views: **Heatmap Ausgaben**, **Jahresansicht**, **Gesamttabelle** and **Kategorie im Verlauf**. They reuse the existing authenticated income/expense read model and canonical domain calculations. Cell drilldown shows the classified booking shares that sum to the selected amount; raw booking amounts remain distinct. The existing custom pivot, saved five-field queries and custom CSV remain available. No financial write path or formula is changed.

The owner-approved scope is the complete four-template slice from #625 / parent #517. Removing or redirecting legacy reports (#487) and the generic chart switch (#626) are separate. There is no additional template CSV endpoint. The coordinator accepted the coherent scope against the approximate size guide: shared projection and renderer, one existing GET, and literal cross-layer proofs for all four templates. No router, API implementation, DB migration, shared UI, global style, manifest or lockfile change is included.

## Source and focused proof

Runtime source is clean `90da8fa9921686015384e2f45863cf9f70d0cf78`, a normal merge of source checkpoint `8a0b8173` and coordinator-verified live Main `3427d925`. All 14 owned source/test blobs and modes remain exact through that merge. Independent whole-source HIGH, separate financial-subset review, the coordinator-only old fixture adaptation and final mechanical/provenance review are clear.

Before the Main refresh, the same 14 source/test blobs passed **five files / 24 tests**, the affected Web workspace typecheck and local ESLint/Prettier checks. An earlier all-workspace typecheck passed; the final required-age check must still cover all repository checks together. Literal tests compare all four projections with the canonical replaced-report outputs, signed split/refund sources, household exclusions, unavailable year months and the 12/36-month windows. Fixtures establish classified transfer-like source behavior and an ordinary future-category expense; they do not establish a new real-transfer or after-today booking scenario.

| Existing test changed by coordinator | Owner basis and preserved coverage |
| --- | --- |
| `apps/web/src/reports/explorer-csv-ui-627.test.tsx` | #625's reloadable report selection uses the existing real router context. Under the owner's October 17 per-file test policy, the coordinator changed only imports and mount setup to use a real memory router. Independent whole-file inversion confirms all four original test bodies, CSV bytes, values, races and assertions remain byte-identical. The implementing agent did not edit this existing test. |

## Actual native browser proof

The fresh E2E build passed at `90da8fa9`. The first browser attempt stopped **before test collection** with `ENOSPC mkdir '/tmp/playwright-transform-cache-1000/f5'`; its raw failure remains preserved outside the repository. The coordinator freed only reinstallable dependencies in verified closed worktrees and passed a write/read/delete probe in the same pinned container. A separately authorized native-only retry reused the successful build only after checking all **167 compiled file hashes and the complete compiled file set**.

The retry passed **12/12 cases in 2.2 minutes**: nine new feature cases plus three canonical setup cases, genuine **WebKit 27.2 / Playwright 1.64.1**, one worker and unchanged test timeouts. Native, wrapper and post-run guards all exited zero. All 14 owned source/test files, all 3,379 tracked files, the 12 protected files, HEAD, clean status and all 167 compiled files remained exact.

The four templates each pass on configured phone **390×664 / DPR 3 / coarse pointer** and an independently created desktop context **1440×900 / DPR 1 / no touch / fine pointer**, in both light and dark themes through the real theme controls. Both profiles use WebKit. The actual phone reports `navigator.maxTouchPoints = 0` despite configured touch support; native phone theme actions use `tap`, but this is not physical-device evidence.

Passing feature coverage includes:

- August Lebensmittel cell **20.01 € = 20.02 € expense − 0.01 € refund**, exact classified contribution IDs, reloadable selection, raw **−20.02 €** booking drilldown, browser back and close.
- Jahresansicht's twelve month headers, unavailable months and literal **3.75 €** monthly mean; Gesamttabelle's 36-month hierarchy, income/future values and explicit incomplete current month.
- Kategorie im Verlauf's actual line and monthly mean, exact **2.50 €** mean and keyboard-accessible **20.01 €** tooltip.
- Both-theme main-region Axe with no violations, strict document overflow checks, genuine horizontal scrolling and successful rightmost monetary-cell interaction. Positive-area phone panel buttons and links meet **44×44 CSS px** bounds.
- Existing five-field saved query identity, return from a template to the custom view, exact custom CSV BOM/filename/literal **1501** cents and grouped saved-view undo. Raw booking, split and related audit fingerprints remain unchanged by report interaction.

The exact 16 original PNGs were opened for visual review. Ordinary/semantic ink, teal/orange per-row heat and line/mean distinction show no new actionable finding. [`runtime-proof.json`](runtime-proof.json) contains only the actual safe profile/scroll metadata, source/build provenance, PNG hashes/dimensions and explicit limits. It includes no raw database, auth state, trace or credentials.

| Template | Desktop dark / light | Phone dark / light |
| --- | --- | --- |
| Heatmap Ausgaben | [dark](heatmap-1440-dark.png) · [light](heatmap-1440-light.png) | [dark](heatmap-390-dark.png) · [light](heatmap-390-light.png) |
| Jahresansicht | [dark](year-1440-dark.png) · [light](year-1440-light.png) | [dark](year-390-dark.png) · [light](year-390-light.png) |
| Gesamttabelle | [dark](total-1440-dark.png) · [light](total-1440-light.png) | [dark](total-390-dark.png) · [light](total-390-light.png) |
| Kategorie im Verlauf | [dark](category-1440-dark.png) · [light](category-1440-light.png) | [dark](category-390-dark.png) · [light](category-390-light.png) |

Full-page phone captures show fixed navigation/FAB at the photographed viewport position and show the table's initial horizontal slice. Recorded `bounds` describe the earlier successful right-edge interaction, before scrolling back to zero for capture. These are different instants. Rectangle size, main-region Axe and successful tested interactions do not establish unobscured hit testing of every control or whole-application/device acceptance. No screenshot concealment, CSS injection or browser-configuration replacement was used.

## Remaining gates

The final **`BUDGET_REQUIRE_AGE=1 npm run check` and normal production build have not yet run** on this candidate. Exact-head canonical Chromium desktop/mobile CI, final delivery review, controlled integration/deployment and public-live revision verification remain pending. Keep #625 open until all public acceptance gates are verified. No merge, deployment, queue loop or completed parent acceptance is claimed by these local results.
