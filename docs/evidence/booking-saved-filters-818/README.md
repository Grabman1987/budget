# Named booking-filter continuation (#818)

Synthetic evidence from 2026-11-02. Implementation ran as a session
`gpt-6.1-sol` agent at medium reasoning in the shared Cloud workspace, in an
isolated worktree; it was not a hosted Codex task. Original prepared refs remain
unchanged. Continuation starts at feature source `2af8b792` and normal-merges
verified main `ef765f5f`, producing source checkpoint `58776575`. No proof-only
workflow wrapper was adopted.

## Reproduced defect and correction

The unchanged real two-client regression failed with expected HTTP409 versus
actual200 after a background preference refresh. See
[the bounded RED record](red-reproduction.txt). The original pre-feature RED
remains run [40730232275](https://github.com/Grabman1987/budget/actions/runs/40730232275)
on `72a9f3ac` / tests-first `85f178df`.

A new draft captures its revision through its explicit initial preference read;
rename/replace captures the revision of the chosen view. Background reads and
conflict/lost-response refreshes never replace that revision. Retrying a stale
draft still conflicts. An intentional restart uses the existing close, manager
and save controls, after reviewing the current stored view. The draft remains
visible after errors. No stale overwrite fallback was added.

The first functional run also found a real Axe label-content-name mismatch on
"Aktuelle Filter übernehmen". Its accessible name now includes that exact visible
text and the target view. The URL independence test compared percent encoding
instead of its value; it now checks the same literal decoded query string,
accepting the current router's standard `+` space encoding.

## Validation

- Domain, real SQLite/API and original URL parser: **16/16** passed, 2.25s.
- Corrected #818 Chromium desktop1440 and mobile390: **13/13**, including three
  setup cases, 32.2s, one worker, zero retries. Both themes, Axe zero, 44px targets,
  overflow, full-tuple replace, literal rows/count/−15.57EUR/CSV IDs, no booking
  writes, pending/errors, explicit lost-response restart, stable rename/replace,
  delete/Undo and real two-client conflict preservation passed. A retry after the
  conflict refresh is also required to return409 and preserve the server tuple.
- Existing #581 register density/inline cents/locks/Undo and #594 native filter
  sums/CSV/Saldo passed in desktop and mobile in the first combined run. Those
  specs and their protected expectations are unchanged. That combined run was
  red only in the three newly prepared #818 cases diagnosed above; the corrected
  rerun was limited to #818.
- `npm run build:e2e` passed. Final workspace typecheck, scoped ESLint and
  formatter checks are recorded in the continuation handoff.

The four PNGs show the actual save and 40-character manager surfaces. They were
visually inspected. `chromium-mobile-*` is Chromium390 emulation, **not WebKit**.
Source and image hashes are in [manifest.json](manifest.json). The owned e2e spec
captures save/manager in both themes for every configured profile, so prepared CI
can supply the required WebKit artifacts.

Local WebKit was not rerun because its six missing host libraries are already a
known environment limitation. Persistent WebKit-iPhone dark evidence, independent
final full-diff review, exact required full CI and root-controlled integration,
Preview/release/live verification remain pending. No feature acceptance, parent
#479 completion or physical-device result is claimed.

## Test-file rationale

- `apps/server/src/api/booking-views-818.test.ts`: preserve prepared tests-first
  API/real SQLite CRUD, strict limits, rollback, audit isolation, no-op, stable
  identity and ABA Undo/redo coverage; formatting only in this continuation.
- `packages/domain/src/ledger/booking-views.test.ts`: preserve strict thirteen-key
  persistence validation, literal filters, corrupt/future documents and existing
  permissive URL coercion coverage; formatting only in this continuation.
- `e2e/issue-818-ledger-saved-filters.spec.ts`: preserve original literal financial,
  density-adjacent and stale409 assertions; adapt the decoded-URL and accessible
  name selectors, require explicit review/restart after a committed lost response,
  strengthen repeated-conflict preservation and capture actual save/manager
  surfaces. No timeout, skip, financial oracle or Axe rule was relaxed.
