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
The new issue-specific browser spec is discoverable as two behavior cases plus
three setup cases, but no browser execution or visual acceptance is claimed yet.
Its planned scenarios include a real authenticated ledger change before CSV
recomputation, followed by no file/reload/retry, and explicit desktop/phone evidence.

Independent HIGH whole-diff review, required serialized age-enabled full check,
production build, actual native browser/light-dark/Axe evidence, exact-head remote
CI and serial live integration remain open. No schema, ledger, auth, lock, undo,
financial formula, production-data, existing-test, framework or dependency change
is included. All local data is synthetic; no acceptance gate or parent is closed.
