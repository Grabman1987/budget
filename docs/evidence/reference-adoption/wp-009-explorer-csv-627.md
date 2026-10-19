# #627 — CSV of the validated current Explorer table

Authority: #627, [SPEC-005](../../product/specs/SPEC-005-reports.md), and the
[owner's Explorer decisions on #517](https://github.com/Grabman1987/budget/issues/517#issuecomment-6212723340).
The delivered #624 persistence is retained. Templates (#625), charts (#626), hub
integration (#628) and portable full export (#522) are separate work.

## Narrow implementation

A pure projection consumes the existing `ExplorerResult`; it performs no pivot,
financial aggregation, rounding or localized number conversion. The rendered table
and CSV share their header projection. The CSV preserves the supplied row order,
integer cells, conditional total/average column and existing footer. In particular,
the footer may include omitted rows under the existing 200-row policy; it must not
be replaced by a sum of the visible rows.

The file uses UTF-8 with BOM, semicolons and CRLF record boundaries. Text is quoted,
embedded quotes are doubled, and formula markers after leading Unicode whitespace
or control characters receive a leading apostrophe. Signed numeric cents remain
numbers. The fixed prefix is `record_type,report_key,period,dimension,class,measure,unit,truncated_count,row_key`,
followed by the actual table columns, including the dimension label. Data and footer
records are distinguished; zero results contain headers and one explicit `empty`
metadata record with blank value cells. Each record states `cents` or `count` and
the omitted-row count. Unsafe/fractional numeric output is refused.

The additive authenticated `GET /api/overview/explorer.csv` accepts only the existing
query tuple, checks its period and recomputes with the existing report read model.
It never accepts client rows. The filename contains only the computed month bounds,
the response is not cached, and the full-ZIP step-up boundary remains untouched.
The small serializer follows existing ZIP encoding conventions without refactoring
or changing that separate export.

## Exactness across concurrent changes

The browser disables export during pending, fetching, placeholder and failed reads,
or when the current tuple differs from the displayed result. A click captures that
validated pivot, computes its deterministic CSV with the same pure projection, and
fetches the server's authoritative CSV. UTF-8 decoding explicitly retains the BOM.
Only byte-equivalent content is made downloadable; a changed amount, row, footer,
metadata, encoding or BOM cannot silently produce another result.

The authoritative attachment filename also identifies the effective month bounds.
It must match the displayed pivot's `months`, and that validated server filename is
used for the download. This binds relative-period provenance even when `cols=keine`
omits month headers: January and February can both have an identical 1234-cent
`1M` CSV body, but their different effective-window filenames must not be accepted
interchangeably. Missing or unrecognized attachment metadata also fails closed.

If the table/tuple changes while the request is in flight, export also fails closed.
The German changed-data message offers an explicit reload; the view remains intact.
There is no snapshot storage, new session protocol, financial write or automatic
retry. Download object URLs are revoked and temporary anchors removed.

## Literal local evidence

- Before the feature, new API cases failed four times at the missing CSV route;
  the existing authentication/full-ZIP boundary case already passed. The new client
  cases also failed before its export helper existed. Logs remain outside the repo.
- Four new domain/API/client/DOM files cover 30 cases. The focused run with unchanged
  Explorer report, saved-view and full-ZIP neighbors passed seven files / 55 tests.
  The later effective-window correction passed all three affected files / 17 tests;
  these counts overlap and are not added together.
- Literal two-row values are `[1234, -234]` and `[0, 100]`, with row totals 1000/100
  and supplied footer `[1234, -134]`, total 1100. Quotes, semicolons, newlines,
  Unicode and control-prefixed formula labels survive safe encoding.
- A 201-row source emits exactly 200 data rows, `truncated_count=1`, and the visible
  supplied footer 20100, not a reconstructed 20000. A controlled client probe keeps
  that displayed result fixed while changed server amounts or row identities are
  refused without a file.
- Rounded-average cents and booking counts retain their units and existing absence
  of a non-addable footer. Single-column views gain no extra total column; empty
  results never fall back to unfiltered data.
- Real API reads preserve `total_changes()` and the original booking rows. Unknown,
  incomplete, future and extra query inputs are rejected. Session denial and the
  separate full-ZIP step-up remain enforced through the existing boundaries.
- Controlled DOM checks cover pending/refetch/error, a successful mismatched tuple,
  retained placeholder rows, an in-flight filter change, no-file changed data, and
  a clean retry with anchor/URL cleanup. No existing tests or assertions are edited.
- Independent review reproduced a relative `1M` rollover with identical January /
  February amounts and CSV bodies; the new client literal first failed by accepting
  the wrong-window response. The attachment-window guard now rejects it. A real
  SQLite/API clock-rollover test proves the identical bodies and distinct month
  filenames without writes, and the DOM test verifies the validated download name.

## Remaining delivery gates

Focused lint and formatting pass. The changed domain, web and server workspaces
typecheck successfully.
The current-source `npm run build:e2e` passed. The first actual canonical WebKit
composition run selected the two new CSV cases, all three unchanged #624 persistence
cases and three setup cases: **7 passed, 1 failed, zero skipped/flaky**. All twelve
frozen source hashes matched after process exit.

All unchanged #624 cases and the explicit 1440px desktop CSV case passed. The phone
case completed its initial download, both-theme Axe/overflow and 44px action checks,
then its synthetic race-fixture POST returned HTTP 400 instead of expected 201.
The NEW test omitted the existing API's required `type: 'booking'` discriminator.
Exactly that field was added; expected status, money literals, all assertions,
timeouts, retries, product source and existing tests remain unchanged. Independent
review cleared the single-field correction. The corrected combined run then passed
**8/8, zero skipped/flaky/unexpected**, in 50.0 seconds, including the complete phone
race/no-file/reload/retry and all three unchanged #624 compatibility cases. All
twelve frozen hashes remained unchanged. The first-run failure is retained.

Actual initial light/dark desktop/phone PNGs and WebKit 27.2 runtime profiles are
preserved outside the repository. Desktop reports width 1440, fine pointer, touch 0
and DPR 1; the canonical phone reports width 390, coarse pointer and DPR 3.

The earlier phone full-page PNGs visibly included the skip link. Safe active-element metadata
records `BODY` before the initial click, after download and before both PNGs; it
does not support calling the link focused or asserting a product focus regression.
The images and metadata are preserved. The final bounded capture genuinely scrolls to the document top and asserts
`scrollY=0` before each PNG. It also records the link's `:focus` match, bounding top /
bottom and computed transform, alongside the existing safe active-element fields.
This tests a capture-position hypothesis without assuming its cause; there is no
hiding, CSS, focus mutation, product change or weakened oracle. That final run passed
**5/5 (two CSV cases plus three setup cases), zero skipped/flaky/unexpected**, in
34.3 seconds. Its twelve source hashes matched before and after execution. The
previous combined 8/8 retains all three unchanged #624 compatibility cases; counts
overlap and are not added.

The final four genuine PNGs show no skip-link overlay. Every pre-PNG sample reports
`scrollY=0`, active `BODY` and an unfocused skip link entirely above the viewport:
phone top −76 / bottom −32, desktop top −72 / bottom −30.25. This supports a
capture-position explanation; the earlier browser painting internals are not proven.
Root and independent review opened all four images and cleared the new CSV visual
scope. This does not claim physical-device, Windows or whole-application acceptance.

Independent HIGH whole-diff/source/security review passed, including thirty new
tests and independent period-provenance/encoding probes. The serialized
`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed **505 test files /
4,507 tests**, and the normal `npm run build` passed, both with actual exit code 0.
They ran on the reviewed 17-file candidate based on `74abab012ee0d99f8a846fd7317f59272759a52f`,
identified by external evidence-manifest SHA-256
`36c951e2f2ebd7a01a42f08c04f5293e5dd087fa246e73cde998250afe4bda51`.
HEAD, all seventeen candidate hashes and the exact changed-path list matched after
both commands. This subsequent delivery update changes only this document and its
Roadmap status, so it does not claim the aggregate ran on these later prose bytes.

The existing `panel.tsx:208` unused-disable warning, JSDOM `scrollTo` notices and
the Vite chunk-size warning remain recorded without configuration changes.
Final evidence-delta review, exact-head remote CI and serial live integration
remain open. No schema, ledger, auth, lock, undo,
financial formula, production-data, existing-test, framework or dependency change
is included. All local data is synthetic; no acceptance gate or parent is closed.

## Actual synthetic screenshot evidence

| Context                         | Light                                                        | Dark                                                        |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Desktop WebKit, explicit 1440px | [Screenshot](627/explorer-csv-desktop-webkit-1440-light.png) | [Screenshot](627/explorer-csv-desktop-webkit-1440-dark.png) |
| Canonical iPhone WebKit, 390px  | [Screenshot](627/explorer-csv-phone-webkit-390-light.png)    | [Screenshot](627/explorer-csv-phone-webkit-390-dark.png)    |

[Actual browser profile, focus, image hashes and distinct run results](627/browser-profile-focus-proof.json).
These are unedited Linux WebKit captures with the isolated synthetic ledger. Exact-head
remote CI, including canonical Chromium coverage, and serial live integration remain required.
