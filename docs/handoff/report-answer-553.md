# Report answer helper — #553 only

Private source package on `codex/report-answer-553`, isolated checkout
`C:/Users/fabia/wt/report-answer-553`, based on verified live main
`531e4b1b9cb642a4f44776beb5af705af8c4813a`. C/PR791 and B/#597 are untouched.
Refs #553; no #554 report rollout, query, writer or monthly-period changes.

## Sources and extraction

Authoritative issue553 and owner488 comment6212675024 require one generated
sentence from the lead/chart facts, an equally long prior period and favourable
metric direction. #552 is independently live at b911f16/PR652 despite stale
checkboxes. Existing month-based `packages/domain/src/spending/period.ts`
`previousWindow` remains unchanged.

Checkpoint28c5a2124e99a9ec3bee1a2911a07143a9652492 is not present in the local Git
object store. Only the prepared report-answer.tsx/.css from READ-ONLY
`slot-c-reports` d373dbb0 were inspected as recovery reference. No mixed commit,
spending-report integration, comparison query or collapsed-section code was
transplanted. That work belongs to blocked554.

## Result and contract

- `reportAnswer` presents supplied safe integer-cent facts. It computes only the
  exact difference, language direction and favourable tone from metric: income
  up/expenses down teal, the reverse orange; equal amounts neutral. Callers
  cannot provide a contradictory favourable flag. Unsafe input, fractional cents
  and unsafe differences throw. A real zero prior stays distinguishable from null.
- `ReportAnswer` renders the sentence/chip, using shared private euro formatting
  and teal/orange/type/spacing/line tokens. Null prior coverage renders neither;
  callers retain their original lead and chart. Biggest positive increase is
  supplied from a report's complete breakdown, not inferred from top-N chart
  buckets. Non-positive increases are not narrated. No free-text generation.
- `reportAnswerWindow` is a SEPARATE pure inclusive calendar-day helper using
  existing UTC civil-date utilities. The immediately preceding window has the
  exact same day count, including leap days/DST boundaries. It validates actual
  dates and ordering. It does not decide coverage or replace monthly producers;
  future report adapters supply null prior data when coverage is unavailable.
- `/dev/report-answer` is a synthetic example under the existing DEV/e2e-only
  route gate. It uses the real helper, shared ChartSvg/BarsAroundZero/table and
  shared privacy controls, with213000-cent lead and chart groups122000+71000+20000.
  No production report is wired in553, and existing screenshot routes/baselines
  are unchanged. The example is unavailable in production builds.

## Per-test-file reasons

- New `report-answer-553.test.tsx`: independent literal213000/183000/30000/12000
  cents and lead/sentence/independent group sum; income/expense directions,
  zero-vs-null, neutral, privacy and unsafe cents. Calendar literals cover leap
  February, both DST changes, different month lengths, one day and invalid dates.
  Test-first checkpoint7cc78690 precedes implementation.
- New `issue-553-report-answer.spec.ts`: real DEV/e2e template example across
  configured desktop1440/Chromium390/WebKit, light+dark. Exact lead/sentence/chart
  table amounts, orange token and favourable class, restored privacy, missing
  prior with lead/chart retained, public/private/missing Axe,44px controls,
  no overflow and bounded viewport screenshots. Test-first checkpoint1cae7c75
  precedes example wiring. No existing test file or oracle is changed.

## Evidence and remaining work

Source-only local agent path; no local Node/npm/build/test/browser/lint/formatter
was run under the host RAM constraint. `git diff --check` is the available local
verification. No runtime result, live status, public PR, baseline regeneration or
full CI is claimed. No new dependency, calculation engine, ledger writer,
booking/lock/audit/Undo path, production dataset or benchmark default changes.

Next: independent capable HIGH full-diff review, then coordinator-scheduled
bounded remote format/lint/full type, literal units and the three-profile E2E.
Inspect actual first attempts and retain any formatter patch outside Playwright
cleanup; no timeout/retry/skip/oracle relaxation. Production-gate verification
must accompany runtime proof. Publication/integration remains coordinator-owned.
