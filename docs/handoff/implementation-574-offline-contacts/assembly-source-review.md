# #574 assembly source review

Reviewed commit `3526611528c3b653ff58d78ba417ab2bae157a02` against `d27f9a2ff042d3c565009040c701ce37141efe98` in `/workspace/impl-574-offline-contact-assembly`. Read-only source review of the assembled delta and relevant HTTP, server, domain, and storage callers. No execution, tests, build, browser, or validation of the assembled head.

## Finding

**P2 — A late legacy Heute response discards independently saved sections.** In `apps/web/src/pwa/read-snapshot-capture.ts:9-18,22-24`, the Heute capture listener accepts a successful legacy `/api/heute` response and calls `saveReadSnapshot` without a merge callback. `apps/web/src/pwa/read-snapshot-store.ts:318,328` then unconditionally replaces the protected `today` row, including a `today-sections-v1` bundle written by `captureTodaySection` (`apps/web/src/pwa/read-snapshot-today-sections.tsx:47-61`). The legacy aggregate is requested by `dimension-page.tsx:24` and `finanzcheck-report.tsx:91`; `heuteQuery` (`apps/web/src/heute/api.ts:214-219`) does not pass an abort signal to the HTTP request. An aggregate request started on a dimension/report page can therefore finish after navigation to Heute, while the Heute capture hook is mounted. If `overview` and `tasks` section responses save first and that aggregate finishes last, the aggregate replaces the bundle. An offline visit then loses those two independently successful section copies and displays the aggregate, even if other section requests failed. This also permits an older aggregate response to displace a newer section copy. The handoff contract in `docs/handoff/implementation-574-offline-contacts/README.md:16-17` says successful sections remain independently retained and a legacy complete copy remains only until a section success replaces it.

Minimal fix: route the legacy `/api/heute` capture through the same native read/merge/write path, and decline that aggregate write whenever the current protected `today` row is a `today-sections-v1` bundle. For legacy-to-legacy replacement, reject a response older than the stored `fetchedAt`. Leave the section merge and other view writers unchanged.

## Scope and limits

No further concrete assembly-specific invariant failure was found in source inspection of the section endpoint/session guard/cache, protected snapshot epoch/logout fences and viewer, receipt queue claim/upload/acknowledgment and HTTP security boundary, or the contact reminder DTO/canonical replay path. This is a scoped static finding, **not validation** of the assembled head or its runtime behavior.
