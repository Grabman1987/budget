# H1 #830 — same-context background refresh

Bounded continuation from main `b6d8c206`, branch `codex/830-refresh-20261102`.
Execution: shared Cloud session, gpt-6.1-sol medium; not a hosted task.
Production redesign stays OFF. No commit, push, integration, publication, owner/device
acceptance or completion of broader H1 is claimed.

## Change and source boundary

The refresh behavior changes only HeutePage, Kennzahlen and CompactForecastCard.
Root subsequently granted one additional minimal accessibility repair in
InvestmentBasisSummary after full-main Axe reproduced a concrete inherited error.
Under ON, successful same-month/period query results remain visible while actively
refreshing. Response scope and `isPlaceholderData` reject previous-context values.
No extra cache, previous-response state or query defaults are introduced. The
forecast retains the existing response-owned canonical 35-day path; its parent
must explicitly certify the matching refresh. Initial loading and aggregate-error
fallback to the independent canonical forecast remain as before. Existing source
dates are displayed with factual refresh text; budget refresh identifies its month.

A failed read clears retained financial content. Production `shouldRetry` retries
only ApiError status 0 (at most twice), never 403/503. During a network retry,
TanStack can report status `success`, data and `isFetching` despite the failed
attempt. Both aggregate and budget therefore also reject `failureCount > 0`.
This changes presentation eligibility only, without changing authentication,
protected caches, HTTP behavior, retries or offline snapshots.

Approved references read from the separate design-foundation worktree:
`DESIGN.md`, `.impeccable/export-2026-11-02-pages.md`, and
`design/export/2026-11-02/{README,image-review}.md`. No original private export,
Heute pilot image or personal footer text is copied. Existing ordering, financial
formulas, money meaning, writers and deep links are preserved.

## Test rationale and results

- New `apps/web/src/heute/background-refresh.test.tsx`: real local API with a
  disposable synthetic SQLite account (123456 cents); held reads exercise ON/OFF
  aggregate and independent budget refresh, 403/503 failure, initial loading,
  month/period navigation with deliberate previous-key placeholders, and actual
  production network retry/recovery. No production writes are permitted by its
  fetch harness. It imports the real production retry predicate. Existing
  monetary assertions, retries and timeouts are unchanged.
- New `e2e/issue-830-background-refresh.spec.ts`: real authenticated synthetic
  sample server and programmatically simulated hidden→visible refresh; retained amounts compare
  to the successful response, then 503 clears aggregate money while independent
  budget remains. Both themes and browser profiles exercise the actual build flag.
  It asserts the actual redesign DOM marker and uses the installed Query focus
  manager's window event target. The spec overrides `document.visibilityState`
  and dispatches `visibilitychange` on `window` to exercise the real installed
  Query listener and query behavior in each browser engine. This does not prove
  native tab-switch, app-focus or operating-system lifecycle behavior. No app-only
  test hook or screenshot baseline changes.
- Existing `investment-basis.test.tsx`: only the exact accessible-link-name
  selector is migrated to `Anlagebasis ansehen · Quelle der Anlagebasis`. Root
  authorized the matching aria-label-only production repair, preserving visible
  text, source meaning, link target and financial logic. Search over e2e/apps/packages
  found only these two old-label references. All existing assertions are retained.

RED: final 11 new transitions against unchanged production source: **4 failed,
7 passed** (`/workspace/work/heute-refresh-red.log`). The failures are ON aggregate
retention, ON budget retention and the two retained-to-error transitions.
GREEN: new transitions plus section-state/Kennzahlen/forecast/investment-basis suites:
**47 passed**, 5 files (`/workspace/work/heute-refresh-green.log`).
Web typecheck, scoped ESLint, Prettier and redesign-ON e2e build passed.
Installed external dependencies were reused read-only; all @budget links point
inside the isolated worktree, with nested external dependencies linked separately.

## Browser environment and findings

Actual WebKit reuses reviewed `/workspace/work/818-browser-cache/webkit-2370`;
prior provenance lives in the existing booking-saved-filters-818 manifest and
`/workspace/work/818-ci-artifacts/evidence-report.md`. Direct unchanged launcher
`pw_run.sh --headless --version` succeeds: WPE WebKit 2.55.0. A separate cache
root links that installation plus existing Chromium/FFmpeg. The host-validator
cache limitation is handled only by process-local
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; no repository config changes.

Initial browser attempts found missing Chromium links in the WebKit-only cache,
then a new-test stimulus error (document event did not reach the installed window
listener). Those were diagnosed from cache paths and actual focusManager source.
No product failure, financial oracle, existing timeout or retry was changed.
The corrected run reached the intended refresh state in desktop, 390 Chromium and
actual WebKit. Full-main Axe detected an inherited, unowned InvestmentBasisSummary
link mismatch: visible `Anlagebasis ansehen`, accessible name `Quelle der
Anlagebasis` (`label-content-name-mismatch`). Root authorized the aria-label-only
repair and exact test-selector migration above. The full-main Axe assertion was
retained. The next bounded run passed all 6 cases (3 setup plus desktop/390/WebKit),
33.5 seconds, zero retries, both themes. Reviewer then requested an explicit actual
redesign DOM marker assertion; final capture below uses that strengthened new spec.

The raw inherited Axe failure is preserved at
`/workspace/work/heute-refresh-browser-axe-red.log`. Earlier stimulus failures are
recorded here from actual observed runs; their raw log path was reused by reruns,
so no surviving raw stimulus log is claimed.

Broader H1 hierarchy, five-second owner protocol, physical devices and 320px
acceptance remain open. Existing screenshot baselines are unchanged.

## Frozen capture

Final marker-asserting run: **6/6 passed**, 33.8 seconds, zero retries, full-main
Axe empty in both themes for desktop 1440×900, Chromium 390×844 and actual WebKit
iPhone13 emulation. The test asserts exactly one `[data-budget-redesign="1"]`
before each theme. [Manifest](manifest.json) records source/test/build and PNG
SHA-256 identities. Raw current run: `/workspace/work/heute-refresh-browser.log`.

All six unmodified originals were opened with `view_image`: desktop-light.png,
desktop-dark.png, mobile-light.png, mobile-dark.png, webkit-iphone-light.png and
webkit-iphone-dark.png. Retained net worth, budget amounts, canonical low and dates
remain legible during refresh; status text wraps without horizontal overflow.
Full-page fixed navigation capture is not physical-device viewport acceptance.
No new visual direction, screenshot-baseline replacement or original export image
is included.

## OFF-path validation

The unchanged new browser spec also passed against an actual
`VITE_BUDGET_REDESIGN=0` build of candidate `cd7c88d7`: **6/6 passed**, 31.2 seconds,
zero retries, desktop/390/actual WebKit and both themes, full-main Axe empty.
The spec asserted the redesign DOM marker absent. Before rebuilding, reviewed ON
web/server bundles and raw test-results were copied to
`/workspace/work/heute-refresh-on-preserved/`; preserved build hashes matched the
reviewed manifest. OFF build/run logs are
`/workspace/work/heute-refresh-off-build.log` and
`/workspace/work/heute-refresh-off-browser.log`; raw OFF output is separate at
`/workspace/work/heute-refresh-off-results/`. The committed ON PNGs and manifest,
source code and tests are unchanged. This remains programmatically simulated
visibility, not native focus or physical-device acceptance.

## PR #911 smoke selector continuation

CI run `41449199053`, head `80d5ed4`, failed its Visual job specifically in
`Redesign OFF/ON build and installed-PWA smoke`; the visual specs had passed
120 cases with 17 skips. Root supplied that CI result; the raw CI log endpoint
was blocked, so no claim is made to have read its stack. Local execution of the
unchanged `scripts/dev/redesign-smoke.ts` reproduced exit 1: the click in
`redesign-t3-proof.ts` timed out after its unchanged 30000 ms while waiting for
exact accessible name `Quelle der Anlagebasis`. The earlier authorized ARIA
repair had changed that name. This is a missed test-selector migration, not a
financial, source-contract or installed-PWA failure.

Per-file rationale: `scripts/dev/redesign-t3-proof.ts` changes only that exact
link-name selector to `Anlagebasis ansehen · Quelle der Anlagebasis` (plus
Prettier wrapping). Every literal money, source, context, URL, focus, reload and
Back assertion and every timeout remains unchanged. Whole-repository source
search including scripts found this sole missed old-only name selector; other
hits were the updated component, unit selector and historical documentation.

Actual local RED: `/workspace/work/heute-refresh-smoke-red.log`, exit 1 at the
old selector. Actual local GREEN after the one-selector migration:
`/workspace/work/heute-refresh-smoke-green.log`, exit 0 for the entire existing
smoke, including T2/T3/T6, installed-PWA OFF→ON→OFF at 1440/390, shell checks at
320, and OFF/ON Chromium/WebKit galleries in both themes. This was one unchanged
smoke execution after the technical selector adaptation, without looser checks or
retries. Existing ON/OFF artifacts and raw results were preserved before these
runs. No committed original screenshot, manifest or application source changed;
new smoke-generated scratch screenshots are not adopted as H1 evidence or claimed
as separately inspected originals. Required exact-head CI remains a separate gate.
