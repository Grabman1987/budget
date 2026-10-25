# Explorer templates — #625

Four fixed templates sit beside saved Explorer views: **Heatmap Ausgaben**, **Jahresansicht**, **Gesamttabelle** and **Kategorie im Verlauf**. They reuse the existing authenticated income/expense read model and canonical domain calculations. Cell drilldown shows the classified booking shares that sum to the selected amount; raw booking amounts remain distinct. The existing custom pivot, saved five-field queries and custom CSV remain available. No financial write path or formula is changed.

The owner-approved scope is the complete four-template slice from #625 / parent #517. Removing or redirecting legacy reports (#487) and the generic chart switch (#626) are separate. There is no additional template CSV endpoint. The coordinator accepted the coherent scope against the approximate size guide: shared projection and renderer, one existing GET, and literal cross-layer proofs for all four templates. No router, API implementation, DB migration, shared UI, global style, manifest or lockfile change is included.

## Source and focused proof

Original table-capture runtime source is clean `90da8fa9921686015384e2f45863cf9f70d0cf78`, a normal merge of source checkpoint `8a0b8173` and coordinator-verified live Main `3427d925`. All 14 owned source/test blobs and modes remain exact through that merge. Independent whole-source HIGH, separate financial-subset review, the coordinator-only old fixture adaptation and final mechanical/provenance review are clear.

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

## Close-header repair and current native proof

Canonical Chromium156 CI at `67212b99` supplied the actual failure cause: both failed mobile Heatmap attempts delivered trusted mouse pointerdown/up/click at (127,779) to fixed **NAV**, while the footer close button occupied y757–801. The selection remained in the URL; the trace did not show a close callback followed by refetch/reopening. Earlier SYSTEM Chromium151 success was diagnostic only and did not clear this canonical failure.

The local repair moves the **same single close button and unchanged callback** into a wrapping source-heading row beside the same focused h3. Only the local renderer and report CSS change. No router, fetch-visibility guard, financial calculation, write, focus callback, shell navigation, timeout or original mouse assertion changes. Four additive real-router tests pass alongside the eight existing new-template unit cases (12/12); Web types, affected ESLint/CSS/format and discovery pass.

The first repaired native batch was **5 passed / 7 failed**. All eight initial return-from-booking header-hit checks passed; seven later failures stopped at an over-early *new* visibility precondition before the original unforced far-cell close click. That failure remains recorded. The corrected test keeps the initial regression guard and every original unforced click/count-zero assertion, then requires nonempty trusted close pointerdown/up/click and actual 44px/viewport/navigation-clear hit geometry **at input**. Browser-native automatic scrolling is allowed; no forced scrolling, substitute close tap, arbitrary delay or timeout change is added to the close flow. A separate keyboard cycle supplies the open-header screenshots.

The one-file formatter, ESLint, format check and official discovery each actually exited zero. Its outside runner still exited one because its subsequent filename counter misread the valid nine-feature-plus-three-setup listing; that wrapper failure is retained and was independently adjudicated, not silently called green.

The corrected second batch passed **12/12 in 2.1 minutes**, genuine WebKit27.2 / Playwright1.64.1, one worker. It reused the earlier successful repaired-product build only after the complete set and every hash of all **167 compiled files** matched; no fresh build is claimed for this second batch. Native command-wait, native composite, source guards, wrapper and lock release all exited zero. All 3,397 tracked files, 33 owned files, 12 protected files, eight product files, HEAD, status and modes remained exact.

All four templates at both profiles/themes produced **16 original unforced mouse-close flows / 48 trusted input events**. Each flow cleared selection and removed the source panel, with the actual close control hit and clear of the navigation at input. Eight return-from-booking and eight separate keyboard-cycle geometry records also passed. Phone is configured **390×664 / DPR3 / coarse**, with raw `maxTouchPoints=0`; true desktop is **1440×900 / DPR1 / fine / no touch**. These are WebKit layout/input results, not physical touch or canonical Chromium156 results.

The following four original, unedited Heatmap frames were opened by the coordinator, implementing agent and independent reviewers. They show a **separate real Enter → Tab focus cycle after the original mouse flow passed**. They are not screenshots of the mouse click itself. The close header wraps on phone and stays above the tab bar. The desktop page heading is partly beneath the sticky search header, and the lower phone link boundary meets fixed navigation; no unobscured whole-page/all-control claim is made.

| Profile | Dark / light open header |
| --- | --- |
| True desktop1440×900 | [dark](source-header-heatmap-1440-dark.png) · [light](source-header-heatmap-1440-light.png) |
| Configured phone390×664 | [dark](source-header-heatmap-390-dark.png) · [light](source-header-heatmap-390-light.png) |

[`close-header-runtime-proof.json`](close-header-runtime-proof.json) records only safe profile, numeric hit/geometry, actual-input and hash provenance. The original **16 table PNGs and `runtime-proof.json` remain unchanged and historical**; the four new header frames supplement them. New exact-head canonical Chromium156 CI is still required to verify the repaired original failing flow.

## Required full check and remaining gates

At the subsequent clean evidence checkpoint **`3c26f42b033763f6a319fd1aa038304265794612`**, based on verified live Main `3427d925`, **`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed 534 files / 4,676 tests** (Vitest 410.52s). All workspace types, repository-wide CSS/lint/format checks and the required-age tests passed. The separate normal **`npm run build` passed** under the same shared host lock. Check, production, wrapper and post-run guards all exited zero; all **33 owned and 3,397 tracked file hashes**, the **12 protected files**, HEAD, file set and clean status remained exact. The lock was released and independently reacquired without blocking. The existing `panel.tsx:208` unused-disable warning and JSDOM `scrollTo()` notices remain in the raw log unchanged.

This is the historical original-template full result, before the subsequent diagnostic tests and local close-header repair. The immutable `runtime-proof.json` continues to describe its original native capture. Complete historical full logs remain in the external `625-final-required-age-full-artifacts` archive.

**Current repaired source passed the required full check** in coordinator session30493: `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed **534 files / 4,682 tests** (Vitest392.88s), followed by normal `npm run build`0. Node22.23.3/age1.2.1 were used. Check, production, wrapper and guards all exited zero; all **3,397 tracked / 33 owned / 12 protected** hashes, HEAD, file set, permission bits and index remained unchanged. The lock was released. This is a result at reviewed dirty-source freeze **`63bf6772790c89b0c624f4315eef3751f255d42f990ee0c4dde8c6aabd1411bf`**, HEAD `67212b99`, with the same four reviewed modified files as the current native run; it is not a clean-commit result. Existing warnings/notices remain in the raw logs.

The coordinator's first outside full runner stopped **before npm check or production began**: it compared complete filesystem mode bits with a freeze containing permission bits only; its finally block then referenced an unassigned index path. The raw wrapper1/preguard errors are preserved. The corrected second runner compared the actual permission-bit representation and completed the unchanged repository gates; no application test failed or was waived in that first attempt.

Successful raw archive: `715-header-required-age-full-second-actual`; result SHA256 **`6ebd8f0218fc7a59e2c7224883feff601558eb0cff300b5000813fd238beb052`**, check-log SHA256 **`f96dd3b6782b7b49148faa8e117202f5dad362a6d9aaad2fa023867419654226`**, production-log SHA256 **`9c3be6c0623dc3c55007ed34cde6d980f9ffc790524f3a9749fbd12e269d96d3`**. The new safe close-header proof records these hashes and both attempts. Original16 table PNGs and original `runtime-proof.json` remain immutable; only the four new header frames/new proof and result documents are proposed for application.

Exact-head canonical Chromium desktop/mobile CI, final delivery-delta review, controlled integration/deployment and public-live revision verification remain pending. Keep #625 open until all public acceptance gates are verified. No merge, deployment, queue loop or completed parent acceptance is claimed by these local results.
