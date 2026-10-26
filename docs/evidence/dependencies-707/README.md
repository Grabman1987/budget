# Existing dependency PR707 continuation

Original head `67316fba` is retained. Main `7b77a574` was merged at `9427d330`;
the two manifest/lock conflicts retain current jsdom30, Hono and web Vite8 as
well as the original dependency updates. No financial source, migration,
authentication policy or verification gate changes.

The previous CI run39945588582 failed Axe4.14's visible-label/name rule for the
shared desktop search and sidebar profile link. Their explicit short names
overrode longer visible text. Expanded controls now derive their names from
their text; icon-only mobile search and collapsed profile retain explicit names.
A separating space preserves the profile's two text parts in the accessible
name independently of stylesheet loading. Visible text and destinations stay the
same; no Axe rule is disabled.
Fresh mobile browser scans additionally identified the avatar summary: its visible
initials were absent from its explicit profile-menu name. That name now includes
both initials and owner name, preserving the visible label for voice navigation.
That initial native run passed10cases, failed4Axe cases (mobile Chromium and
WebKit, each light/dark) and had3existing desktop-only profile skips. All four
failures identified the same avatar summary; desktop Axe, real Freedom capture/
Undo and the three search-focus cases passed. It is not a passing whole run.

Scoped test adaptations:

- `sidebar.test.tsx` verifies complete visible profile/auth-method names, a named
  synthetic owner and the collapsed icon's name instead of an overriding label.
- `search-launch.test.tsx` selects the full desktop name; existing navigation,
  keyboard, result and focus assertions remain.
- `global-search.spec.ts` selects the exact desktop or mobile trigger name in its
  existing URL/history/month/scroll/focus preservation case; assertions unchanged.
- `freedom.spec.ts` updates only the desktop profile-link selector to its full
  name. Every financial, mutation, cache and Undo assertion remains unchanged.
- `mobile-chrome.test.tsx` additionally verifies the literal visible initials and
  complete menu name; no existing assertion is replaced.

The focused accessible-name regressions first failed five cases. After correcting
the names and DOM text separator, five affected suites passed70/70. These initial
runs used the original merged lock's test Vite7, not the final dependency graph.

An npm audit then identified a second, transitive Vite7.3.6 with a high advisory.
`npm update vite --package-lock-only --ignore-scripts` uses the existing allowed
ranges to share Vite8.3.5 with the app, removing the unused Vite7/Rollup graph.
LightningCSS moves with Vite and PostCSS shares the already used8.5.31. The removed
Linux LZMA optional package belonged to removed Rollup. No override was introduced.
The refreshed audit reports four moderate findings in the existing DrizzleKit/
esbuild development chain, no high finding; no breaking forced audit fix was run.

Final-lock `npm ci --engine-strict` and build passed. The seven-suite final-lock
run had92passes/one initial header-loading timeout while typed lint was also
running; the unchanged isolated header suite then passed7/7. After the mobile
avatar correction, its two affected component suites passed8/8. These counts
overlap. Scoped ESLint passed for the initial change; CRLF normalization fixed a
local package.json formatter warning without changing its canonical Git content.

Independent full source/lock/test review is CLEAR at `caa7f4f0`, including all48
new/relocated registry records and manifest/lock consistency. The scoped Linux
shell run40249619850 passed44tests with9configured profile skips in53.1seconds,
without baseline changes. Its images establish unchanged visual rendering, not
the subsequently discovered mobile avatar accessibility fix.

Independent mobile-fix review is CLEAR at `fef3fff6`; scoped ESLint for that
component and its test also passed. The final scoped Linux strict Axe run
40250485932 passed all45cases in1.8minutes, including desktop, mobile Chromium
and WebKit light/dark scans, without weakening any rule or adding skips.
The actual test summary was checked because the snapshot workflow itself permits
test failures. No screenshot baseline change was produced.

`npm audit --omit=dev` reports zero known production-dependency findings; the
four moderate development-tool findings above remain. Required full CI,
integration and publication are pending; this is not a live-delivery claim.

## Populated-view accessibility repair after full CI

Full CI run `40251104969` at `dc020f4e` failed browser checks. Its static,
Linux/Windows unit, Docker and restore checks passed. The earlier 45-case strict
Axe run covered report routes, not every populated control exercised by full CI;
it was insufficient evidence for the entire dependency update.

The failed jobs identified visible-label/name mismatches in eleven variants:
assignment suggestions, mobile available amounts, phone selection counts, booking
names/fallbacks, dates, amounts including FX detail, categories, account links,
contact section copy, contact source links, and the collapsed sidebar profile.
The repair includes the existing visible text in accessible names. Booking
controls derive it from their rendered children with a screen-reader action
prefix, so dates, FX detail and privacy masking follow the actual display.
Explicit text nodes preserve word boundaries. No callback, calculation, route,
visible wording, CSS, authentication rule or Axe exclusion changes.

The collapsed profile's explicit name now includes the existing owner or session
method text too. This supersedes the earlier short collapsed-name implementation
above; its original review and runtime evidence remain historical.

Per-file test rationale for this repair (all existing financial, mutation, lock,
audit, Undo, timeout and screenshot expectations remain unchanged):

| Test file | Scoped reason |
| --- | --- |
| `budget-ui.test.tsx` | Add the literal accessible ghost suggestion name while retaining the actual-zero edit assertion. |
| `plan-phone-selection-590.test.tsx` | Select phone group/all names with their visible count and the available-amount name. Existing selection identity and no-write checks remain. |
| `plan-separated-headings-481.test.tsx` | Select counted phone group/all names; desktop checkbox names stay unchanged. |
| `contact-statement-738.test.tsx` | Select the copy action by its visible phrase plus section. Exact copy contents and privacy checks remain. |
| `account-overview-577.test.tsx` | Allow the existing review status after the specific account-link name; fixtures and literal balances remain unchanged. |
| `account-review.test.tsx` | Select account links including their review text; all review dates, values and the existing timeout remain. |
| `booking-table-581.test.tsx` | Add literal fallback/date/category/amount names and verify that the accessible amount becomes masked when privacy is enabled. |
| `sidebar.test.tsx` | Assert full collapsed names for a synthetic owner and the default Passkey session. |
| `e2e/account-review.spec.ts` | Match the same account within its row when the link also contains review status. |
| `e2e/contact-report.spec.ts` | Select the dated booking action including its rendered fallback. |
| `e2e/fx-detail.spec.ts` | Select the same USD account including review status; retain native/EUR values, rates, reconciliation and Undo. |
| `e2e/issue-481-separated-group-headings.spec.ts` | Include phone selection counts in group/all selectors. |
| `e2e/issue-481-single-category-band.spec.ts` | Include counted phone selectors and the existing available amount in the cover-action name. |
| `e2e/issue-583-capture-two-column.spec.ts` | Keep the dated booking selector while allowing its rendered fallback suffix. |
| `e2e/issue-588-plan-menus-undo.spec.ts` | Select the counted phone all-selection control. |
| `e2e/issue-590-phone-selection.spec.ts` | Select counted phone group/all controls; desktop checkbox selectors and native hold/cancel assertions remain unchanged. |
| `e2e/issue-738-contact-statement.spec.ts` | Select the visible copy phrase plus section; privacy, literal copy and actual Save/Undo remain. |
| `e2e/month-nav.spec.ts` | Scope the cover action to the existing target row and allow its displayed amount. |
| `e2e/payroll-projects.spec.ts` | Keep the dated booking selector with its rendered fallback suffix; project financial assertions remain. |
| `e2e/plan-compact-grid.spec.ts` | Include phone group/all counts without changing desktop checkbox selectors or cent totals. |
| `e2e/plan-ghost.spec.ts` | Select the counted phone all-selection control; grouped Undo and capped assignment remain. |
| `e2e/plan-inspector.spec.ts` | Select the counted phone all-selection control; inspector behavior remains. |
| `e2e/plan.spec.ts` | Allow the cover-action amount suffix; capped transfer and negative-assignment assertions remain. |

The first seven-suite repair run passed 75 of 80 cases. Four failures came from
an accidental selector replacement in a fixture name; the original string was
restored. The new literal-name regression caught a missing word boundary between
the hidden prefix and visible children. A four-suite follow-up passed 16 of 17
cases; the remaining failure was the same separator because the initial scripted
replacement had not applied. After the explicit patch, both affected ledger
suites passed all 20 cases. The corrected overview, account-review and sidebar
suites passed in the preceding follow-up. These counts overlap and are not a
single complete-suite run. All checks used the final lock and Node 22.23.3.

The repair is awaiting a different agent's independent review and focused native
browser evidence before another exact-head required CI run. No claim that the
full accessibility failure is resolved is made from the unit checks alone.

### Focused Linux result and bounded follow-up

Independent review of the new repair is CLEAR at `875b4c9a`. Scoped ESLint,
the additional FX selector lint and web TypeScript checks passed. Linux run
`40253453145` checked out that exact revision (rather than the workflow's main
revision). Its actual summary is **53 passed, 12 failed, 1 existing profile skip**
in 11.5 minutes; the workflow reports success because it permits test failures.
It produced no baseline changes. Every failed case also failed its configured
retry; this is not a passing runtime result.

Successful unchanged cases cover Plan suggestions and selection, native FX,
contact copying/source actions, account overview, upcoming bookings and the
register's layout/Axe scans. The failures have three bounded causes:

- Eight ledger cases stop at the shared account-link helper, which still expects
  the old name without the visible review state.
- Three inline-write cases use an old end-anchored booking name or expect date
  text without the newly included screen-reader prefix. Their original literal
  date, cent values, reconciliation locks and Undo assertions are retained.
- One collapsed-sidebar case still fails Axe: only the avatar initials are
  visible when collapsed, and the explicit name omitted them. The corrected
  name includes those same initials as well as owner/session context.

The follow-up changes only that sidebar name plus its literal unit expectations,
and the necessary selectors identified in the failed run and a bounded search
for the same old selector patterns. Additional per-file rationale:

| Test file | Scoped reason |
| --- | --- |
| `sidebar.test.tsx` | Include literal visible `NU` initials in both collapsed-name expectations; expanded names remain unchanged. |
| `e2e/ledger-helpers.ts` | Keep the link role and literal account-name prefix, escaped as a regex and scoped to overview rows, while allowing the review-state suffix. |
| `e2e/issue-581-account-register.spec.ts` | Keep the exact restored `17.10.` date with its action prefix and select the existing edit action with its rendered suffix. |
| `e2e/issue-632-pending-account.spec.ts` | Adapt the same end-anchored edit selector; pending-state and no-write checks remain. |
| `e2e/issue-741-payroll-automation.spec.ts` | Adapt the existing row edit selector; automation cents, source linkage, audit and Undo remain. |
| `e2e/issue-741-card-automation.spec.ts` | Adapt the same row edit selector; statement reconciliation and grouped Undo remain. |
| `e2e/register.spec.ts` | Adapt the same row edit selector; capture/edit and timing observations remain. |
| `e2e/issue-511-overview-figure-layout.spec.ts` | Match the same scoped account row with the link's review text; figure and geometry assertions remain. |
| `e2e/issue-578-account-review.spec.ts` | Match the named quiet account including review text; review-state, Axe and overflow assertions remain. |

Only the three failing specs need a focused rerun. The successful unchanged
control cases above are retained as revision-qualified evidence; exact-head
required CI, integration and publication remain pending.

### Final focused verification

The bounded follow-up is independently reviewed CLEAR at `115536eb`. Its sidebar
unit suite passed all 4 cases; scoped ESLint, formatting and diff checks passed.
The prior full changed-file lint and web typecheck at `875b4c9a` remain qualified
to that revision; the follow-up changes only the reviewed name and test adapters.

Linux run `40255063325` checked out exact source `115536eb` and ran only
`sidebar-zerosum.spec.ts`, `issue-581-account-register.spec.ts` and
`ledger.spec.ts`. Its actual result was **20 passed, 1 existing profile skip** in
1.7 minutes, with no failures, retries or baseline changes. The skip is the
existing desktop-only sidebar case on the mobile project. The register's real
inline cent/date/category writes, Undo and reconciled locks passed across its
configured desktop, mobile Chromium and WebKit profiles. The shared ledger
helper and collapsed-profile accessibility cases passed too.

Together with the unchanged successful cases in `40253453145`, this is focused
native-browser evidence for the identified populated-control regressions, not a
claim of a passing full CI run or physical-device testing. Counts overlap and
must not be summed as distinct tests. The additional same-pattern adapters in
other specs remain subject to the upcoming exact-head full CI. No baseline,
financial expectation, timeout, skip policy or verification gate was relaxed.
Required CI, integration and publication are still pending.

### Full-CI follow-up: waterfall rail and old annual occurrence grid

Full CI `40278334866` at `e89293c1` found two further desktop naming failures in
`plan-compact-grid.spec.ts` and `plan-year-events.spec.ts`, including their
configured retries. Shard 4 also recorded the separate existing portfolio retry
button detachment as flaky; this patch does not change that test or its timeout.

The original synthetic traces in artifact `12632160209` identify the exact
failing controls: waterfall `.rail-btn` names omitted their visible stage
numbers, and annual `.event-plan` names omitted the displayed `−100,01 €`
occurrence amounts. The rail name now follows its rendered number, title,
optional subtitle and status, retaining the next-stage explanation. The annual
name retains the event/date/edit context and includes its existing formatted
amount and disabled marker. The formatter retains privacy masking. Visible
contents, CSS, calculations, scenarios and click handlers are unchanged.

The previous populated-control checks did not open the waterfall inspector and
did not populate this old annual occurrence grid. Their passing results remain
valid for their exercised states, not evidence of complete route/state coverage.
The separately prepared annual redesign is not used to bypass this failure:
PR707 must pass independently on its current annual implementation.

Per-file test rationale:

- `plan-menus.test.tsx` adds literal visible waterfall stage/status names and
  verifies the interaction performs no financial writes. Two initial assumptions
  in this new test were corrected after inspecting its fixture and caller: the
  fixture has zero target need, so it has no next-stage suffix, and the inspector
  rail stays a waterfall when the main grid changes view. No pre-existing test
  expectation was changed. The final suite passed all 9 cases.
- `year-planning.test.tsx` adds literal enabled, disabled and privacy-masked
  occurrence names; resets the test-only privacy flag after each case. All 5
  cases passed in the initial two-suite run (13 passed, 1 new rail-test failure).
- `plan-compact-grid.spec.ts` and `plan-year-events.spec.ts` now assert the full
  violations array is empty instead of mapping it to IDs first. The assertion
  remains equally strict and exposes the exact failing nodes directly in CI,
  avoiding a large trace download for future diagnosis. All financial, geometry,
  Undo, focus, timeout and profile expectations remain unchanged.

No old exact rail-name selector was found; the existing browser flow selects its
visible title and remains unchanged. Focused Linux verification of these two
specs and independent review of this delta are pending. No full-CI success or
publication is claimed.

Independent review of the complete follow-up delta is CLEAR at `4c0db51b`.
Auxiliary Linux run `40280885011` was cancelled during browser/system-dependency
installation after approximately nine minutes. Its completed log shows slow,
continuing Ubuntu package downloads, not an application assertion failure. The
test and baseline-commit steps were skipped; this run supplies no browser proof
and changed no baselines. Instead of repeating that setup, the next required
exact-head full CI exercises both corrected flows in its existing preinstalled
Playwright container. The reviewed component regressions and precise trace
causes above support this correction; full browser acceptance remains pending.

### Proven rail word-boundary correction

Required run `40281973655` at `d69973e0` passed the old annual flow but still
failed the desktop compact-grid rail check. The label-only rail correction was
insufficient: its displayed spans had no literal word boundaries. Axe 4.14's
`visibleVirtual` joins descendant text nodes without inserting CSS grid gaps,
whereas the explicit accessible name contained spaces. The unit check had only
verified that explicit name, so it did not detect this difference.

A local Chromium reproduction used the exact synthetic failing node and current
production `plan.css`, recording the unchanged Axe check's input strings:

| State | Visible text read by Axe | Accessible name | Rule violations |
| --- | --- | --- | --- |
| Before | `3Liquiditätspufferkeine Posten` | `3 Liquiditätspuffer keine Posten` | 1 |
| With literal separators | `3 Liquiditätspuffer keine Posten` | `3 Liquiditätspuffer keine Posten` | 0 |

The button and all four grid-child rectangles were exactly identical before and
after that single-variable change. This is a synthetic component experiment,
not evidence that the whole application passed. Its local script/result are
`private/707-rail-browser-repro.mjs` and `.json`.

The final source change only adds literal spaces between the rail number, title,
optional subtitle and status. The independently reviewed explicit name and
next-stage hint remain intact; CSS, amounts and actions are unchanged. The
existing `plan-menus.test.tsx` regression now additionally checks the literal
rendered text: it failed with `1Fixkosten & Mindestratenkeine Posten` before the
change, then the whole 9-case suite passed. No prior financial expectation was
changed and no extra browser assertion, skip or timeout was altered.

After a successful local E2E build, the existing desktop
`plan-compact-grid.spec.ts` passed on the real app with installed Chromium:
**4 passed = 3 setup cases + 1 complete desktop flow**, no retries. The feature
took 30.2 seconds; the run including synthetic database setup took 2.7 minutes.
It retained both themes, strict Axe scans, literal cent results, keyboard and
multiple-month interactions, and existing layout checks. The resulting light
image was inspected; no tracked baseline changed. Scoped ESLint and formatting
also passed. Local records are `private/707-rail-boundary-red.log`,
`707-rail-boundary-green.log`, `707-rail-boundary-build.log` and
`707-rail-desktop-flow.log`; counts across these runs overlap.

After this focused browser pass, the orchestrator cancelled the remaining jobs
of the already-failed required run `40281973655` to free the full-CI lane.
Unfinished/cancelled jobs are not counted as passing. This is distinct from the
earlier auxiliary run cancelled during package installation. A new complete
exact-head required run, independent final-delta review and publication remain
pending; no full-CI success or live-delivery claim is made here.

### Existing browser synchronization failures exposed by the next run

Required run `40284480127` at `c9f6dc67` passed both corrected desktop rail and
annual flows. Shard 4 instead failed the unchanged month-close scenario on both
configured attempts; portfolio positions recovered on its configured retry and
was flaky, not a final failure. This follow-up changes two existing browser test
files only, with no product, query policy, deadline, retry or financial-oracle
changes.

- `e2e/month-close.spec.ts`: wait for the visible booking editor's own entry
  animations to finish before the existing category fill and pointer click.
  The CI trace shows three unstable attempts during the 240 ms native modal
  translation. Playwright's fourth pointer attempt uses `scrollIntoView` with
  `block: 'start'`, moving `.bk-body` to scrollTop 131 and the category anchor
  outside its clip. The picker then hides as designed. The group heading
  intercepts hit testing; no option/group mousedown was actually dispatched.
  This is a readiness correction, not a forced click, keyboard substitution,
  reduced-motion override or fixed sleep. Also require the previous reconciliation
  input to disappear after its save before opening the next account's editor;
  this proves completion of the intended sequential flow. All five-step, save,
  whole-Undo and close-marker assertions remain unchanged.
- `e2e/portfolio-positions.spec.ts`: keep the synthetic 503 route active until
  a synchronous capture listener observes the existing real retry-button click,
  then allow the real positions response. Remove interception and the temporary
  DOM flag after the unchanged `88.000,00 €` assertion. The earlier #702 sidebar
  attachment/two-frame barrier remains intact. The current trace proves a real
  successful background request after premature route removal and before the
  click; it does not establish which observer/focus event initiated that request.
  Every unavailable, missing-price, missing-FX, empty-state and navigation
  assertion and all financial fixtures remain unchanged.

Before the tracked correction, a private instrumented copy completed the real
category pointer click and save but exhausted the unchanged 30-second scenario
deadline during a later Axe scan. It is not a passing full scenario. A separate
bounded native segment then passed the original category/PATCH/inbox assertions
in 10.1 seconds. Its recorded geometry shows the entry translation ending before
the actual option pointerdown, with body scrollTop remaining zero. These local
diagnostics explain the timing dependency; they do not replace exact-head CI.
Records are `private/707-monthclose-diagnostic.log`,
`707-monthclose-focused.log`, `707-monthclose-geometry.json` and the downloaded
CI shard trace. Scoped formatting and ESLint passed for both changed test files.
The single run of both affected existing desktop scenarios finished with
**4 passed (3 setup cases + the portfolio scenario), 1 failed**, no retries.
The complete portfolio scenario passed in 12.3 seconds with its original
unavailable, missing-price, missing-FX and empty-state expectations. Month close
passed the repaired category pointer/save segment, then timed out at the existing
step-2 `Wert in EUR` fill. It is not a passing whole scenario or an Axe timeout.
The local trace shows the value-update click while the preceding reconciliation
POST was still pending; its success callback clears the shared selected row.
The click action was recorded at 75650.525 ms; the preceding reconciliation
request began at 75541.555 ms and its 201 response completed approximately
75667.727 ms. The added hidden-input assertion waits for that preceding flow
to finish before the unchanged next click. This does not claim that rapid
overlapping user actions have been validated or that product behavior changed.
Local result: `private/707-ci-sync-browser.log`. The already-passing portfolio
scenario was not repeated. No full-CI success is claimed.
The step-2 timings above were extracted before the next standard Playwright run
cleaned its temporary `test-results` trace. That local trace is not a retained
artifact; the failure log and extracted timings remain available. The downloaded
CI category-failure traces and bounded native geometry record are retained.

After the additional reconciliation-completion assertion, the original full
desktop month-close scenario ran exactly once more with its original 30-second
deadline and no retries. Both repaired transitions passed, followed by the
manual value save, overdraft coverage, light/dark step-3 Axe scans, plan apply,
whole-plan Undo and reapply, and the light step-4 Axe scan. The scenario exhausted
its deadline during the dark step-4 Axe scan; it did not reach the final close
marker. Result: **3 setup passed, 1 scenario timed out** (34.2 seconds including
cleanup; 1.7 minutes overall). This is partial execution evidence, not a passing
full flow, and no further local repetition or deadline change was made.
The final log and failure trace were retained at
`private/707-monthclose-readiness-browser.log`,
`707-monthclose-readiness-trace.zip` and `707-monthclose-readiness-error.md`.
Scoped ESLint and formatting passed after the final assertion. Independent
review and exact-head full CI remain required.

### Reuse the existing Linux browser runtime

The manual snapshot/diagnostic workflow now uses the same pinned
`mcr.microsoft.com/playwright:v1.64.1-noble` image as required CI, matching the
locked Playwright 1.64.1 package. Bash and the existing CI safe-directory pattern
support its unchanged scripts and baseline commit. This removes only the
redundant browser/system-package installation that delayed auxiliary run
`40280885011`. Branch protection, the non-main guard, inputs, credentials,
timeouts, test commands and baseline review obligations are unchanged. The
workflow still permits a failing test step, so its actual test summary must be
inspected; workflow success alone is not acceptance. A scoped Linux run and
independent review of this runner change are pending. No measured speedup or new
browser pass is claimed by changing the workflow.

The independent review of the two synchronization changes (`9896d71f`) and
runner change (`bf5b33fd`) is CLEAR. Scoped Linux run
[40288539774](https://github.com/Grabman1987/budget/actions/runs/40288539774)
checked out exact `bf5b33fd40eeeb13be449152358a275511fc34f5` and ran only
`e2e/month-close.spec.ts` and `e2e/portfolio-positions.spec.ts` with their
configured projects. The actual browser summary is **17 passed in 1.2 minutes**,
without retries, failures or skips. This includes the complete month-close flow
and portfolio error/retry scenarios; it supersedes the partial Windows evidence
for these Linux flows only. The baseline step reported **No baseline changes**,
and the remote branch stayed at the tested commit. The existing browser container,
checkout, Node setup, build and tests all ran successfully. Required complete PR
CI and publication still remain outstanding. This is not a measured overall
workflow speedup or a physical-device result.
