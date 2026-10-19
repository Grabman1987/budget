# Personal freedom goal (#617) — implementation candidate

Refs #617, part of #528. The owner-approved target-year/age field, required monthly saving and deadline marker are implemented as a bounded candidate. This is not a validation or delivery claim. The source starts at live main `b0aae61eab4042420692e2efd40fd675fb44e982`; #615 and #616 already supply the shared investment basis and exact month-end history.

## Contract

The private `wealth.freedom.goal` appSetting stores only `{schemaVersion:1,goalYear:number|null}`. Absence is unset. Unknown versions or malformed stored bytes remain unavailable and cannot be overwritten through this interface. No table migration is introduced. Compatibility, migration and security review still apply to the new key and existing undo lifecycle.

Writes compare the latest exact-setting audit insertion ID before checking for a no-op. Actual undo/redo and delete/recreate advance this revision even if the JSON is the same. A setting change and its audit group are one transaction; unchanged writes create no audit or undo action. Clearing saves an explicit null, and undoing an initial create can restore absence without restoring the initial revision.

Age entry is resolved on the server from the existing validated complete `profile.birth_date`, never from a month-only birth source or an invented day. The response exposes neither raw birth date nor birth year. Age-dependent writes also compare an opaque DOB audit revision before a no-op, including profile undo/recreate. No actual personal dates or goals are accessed for development, placed in logs, or committed; fixture dates and years are synthetic. Private DB audit snapshots remain necessary for undo.

The existing January goal-year convention is preserved. “Alter im Kalenderjahr” means the age reached in that target calendar year, not a birthday-month deadline. The existing `requiredMonthlySavingCents` is unchanged: monthly compounding, interest rounded to cents once per month, month-end saving and minimum whole-cent result. The approved synthetic oracle remains 129176 cents, not the floating prototype's 129175; zero-return 1000 cents over three months needs 334, since 333 yields only 999. Unknown/unsafe valuation or target, overflow and an excessive horizon remain unavailable; past unmet goals do not become a fabricated zero rate.

The form keeps a dirty draft and its original CAS revision through background refreshes. A conflict retains the input and asks for explicit reload before retry. Grouped undo/redo uses the existing route. Current saving and return assumptions remain unsaved; the required rate uses the current return assumption and current canonical investment/target amounts. Privacy uses the existing amount masking in text and accessible output.

The availability wrapper also checks that the unchanged shared search's answer actually reaches the target and that one cent less does not. Its original upper-bound assumption can fail for signed negative capital: a one-month synthetic start of −100000 cents at 500bp incurs −417 interest, so the search's 101000 payment leaves 583 rather than 1000. This package reports that case unavailable instead of publishing a false rate or replacing the shared financial algorithm.

Only the local FreedomChart gains a deadline marker and optional drawing extent. The deadline remains visible when the unchanged forecast reaches its target earlier. No actual/forecast sample, cent value or interpolation is added, and the history model, projection, selected-universe resolver and R16 formulas are unchanged. The original forecast table still contains the same original projection values.

## New proof scope — not executed yet

- Pure domain: strict setting compatibility, retained 129176 and 334 literals, zero/reached/missed/null/overflow/horizon cases, complete-DOB/calendar-year age and leap-day cases.
- SQLite: saved state/reopen, two real connections and stale save, no-op, clear, real audit undo/redo/delete-recreate ABA, DOB edit/undo ABA, malformed/future bytes and audit-insertion rollback.
- HTTP: real app route mounting under injected session/origin decisions, canonical save/reload/undo/redo, strict payload/query rejection, DOB revision conflict and no input logging. This does not replace independent credential/session cryptography tests.
- UI: dirty-draft CAS conflict and explicit retry, age payload/undo/redo, scenario preservation, amount privacy and unavailable settings.
- Native: two new bounded 90-second multi-action cases for actual save/reload/age/undo/redo/two-context conflict/clear, and current rate/deadline geometry/privacy/real theme controls/Axe/44-pixel/overflow/screenshots. No existing assertion, timeout or test was edited; individual expectations retain their normal limits.

## Current status and remaining gates

Only the explicitly granted `npm ci` has run: exit 0, all 3263 then-existing tracked/new source files and HEAD unchanged. No TypeScript, unit, browser, E2E build, aggregate or production build has been executed for this candidate. Independent whole-diff financial/migration/security review precedes the first execution. Focused checks, native/Chromium1440/390/WebKit light/dark evidence, one scheduled full check/build, exact-head CI and serial live verification remain open. No commit, PR, merge or deployment for #617 exists.

The initial main base predates the separately reviewed #595 shared reduced-motion correction; no shared-style workaround is introduced here. Required final current-main integration and actual theme evidence must account for that dependency rather than claiming an unrun browser result. All existing tests, financial formulas, profile write paths, global charts/router/styles, manifests, lockfiles and repository rules are unchanged. #699/#700 scope is unrelated and untouched.
