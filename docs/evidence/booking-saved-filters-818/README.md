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

## Historical implementation validation

The later capture checkpoint below supersedes the missing-WebKit and pending-CI
statements in this historical record.

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

## WebKit capture checkpoint — 2026-11-02

Actual source: `b78369619837b0f4f9c7429c794f11ea27393581`. Session agent
`/root/filters_evidence` (`gpt-6.1-sol`, medium) used an isolated shared-Cloud
worktree, with independent environment review by `/root/evidence_review`
(`gpt-6-astra`, high); these were session agents, not hosted tasks. All
five source hashes above still match. The four earlier Chromium PNGs are preserved
byte for byte. Required full CI [41434884784](https://github.com/Grabman1987/budget/actions/runs/41434884784)
is green at this source head; any subsequent evidence commit still needs its own
required exact-head checks before integration.

The original CI feature PNGs could not be recovered: passing e2e shards upload
artifacts only on failure, while the always-uploaded visual job selects
`expectScreenshot|toHaveScreenshot` specs and excludes this `page.screenshot`
spec. The sole artifact download redirects to a storage host outside the current
network policy. These new files are actual local runtime originals, not inspected
CI artifacts.

`npm run build:e2e` passed. The unchanged focused spec passed Chromium desktop and
390px mobile with setup **13/13**; its five WebKit cases initially stopped at
launch because host libraries were unavailable. A WebKit-only diagnostic retry
still stopped at the system linker-cache check. After those two infrastructure
failures, the alternate environment route was independently reviewed before use.

The reviewer found the pinned bundle launcher overwrites `LD_LIBRARY_PATH`, so
extracting libraries to an external loader path alone could not launch the engine.
Nine checksum-verified Debian library packages were extracted into a separate
copied pinned browser cache. All 27 original browser files and seven original
symlink targets remained identical; 34 library files/SONAME links were added to
existing loader directories without overwriting originals. Direct unchanged
`pw_run.sh --headless --version` then exited zero. Playwright's preflight checks
`ldconfig -p` for runtime-loaded GLES and cannot see this isolated provisioning;
only the final process used `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` after
actual loader validation and the successful direct smoke. App code, browser
engine/launcher, spec, assertions, timeouts, retries and CI gates were unchanged.
Detailed package/browser hashes and the exact command are in `manifest.json`.

Final actual command, with the prepared Node environment:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/work/818-browser-cache PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright test e2e/issue-818-ledger-saved-filters.spec.ts --project=webkit-iphone --workers=1 --retries=0
```

Result: **8/8 passed**, including three setup and five feature cases, **42.9s**,
zero retries. Save and manager cases exercise both themes, Axe, 44px controls,
overflow, exact tuple persistence and preference-only Undo. The real concurrent
rename and repeated conflict checks also passed. Playwright1.64.1 uses WebKit27.2,
revision2370, with iPhone13 emulation at390×664 CSS pixels and device scale3.

All four new unmodified full-page PNGs were opened and visually inspected:

- [Light save](webkit-iphone-light.png)
- [Dark save](webkit-iphone-dark.png)
- [Light manager](webkit-iphone-manager-light.png)
- [Dark manager](webkit-iphone-manager-dark.png)

The save sheet and manager actions are legible and fit the viewport; 40-character
names wrap within their controls in both themes. These are original device-scale
captures, without resizing or cropping. This closes the missing persistent
WebKit visual-evidence gap. It does not claim a physical-device result, owner
acceptance, parent #479 completion, preview, integration or publication.
