# #574 late-aggregate fix source review

Reviewed `b547ce39b7c4994c4932404b0c954a4db02c406b` against `3526611528c3b653ff58d78ba417ab2bae157a02` in `/workspace/impl-574-offline-contact-assembly`, with the prior finding in `574-assembly-source-review.md`. Read-only source/Git inspection only.

**Scoped source review: no finding in the fix delta.** `apps/web/src/pwa/read-snapshot-capture.ts:20-27` now gives the legacy `/api/heute` write a merge callback. The unchanged store performs its read, callback, and put in one native readwrite transaction (`apps/web/src/pwa/read-snapshot-store.ts:293-335`), so a preceding section write is visible to the aggregate callback, including across tabs. The callback declines the write if the current row is `today-sections-v1`, or if an existing legacy row has an equal/newer receipt timestamp. Conversely, if the aggregate commits first, the unchanged section callback (`apps/web/src/pwa/read-snapshot-today-sections.tsx:49-61`) replaces it with the section bundle. Thus both write orders preserve the first successful section, resolving the prior P2 ordering case in source.

The changed conditional leaves `accounts`, `bookings`, and `plan` on their prior writer (`read-snapshot-capture.ts:20`). The token, generation, logout, epoch and storage fences remain in the unchanged `saveReadSnapshot` path (`read-snapshot-store.ts:275-337`); the fix adds no route, response, auth, viewer, or privacy change. The two other changed paths are handoff documentation and an archived pre-fix source report.

This is **not runtime validation**. No tests, checks, typecheck, build, browser, CI, PR, merge, deployment, or source edits were performed. Concurrent IndexedDB behavior and the full assembled feature remain open for later verification.
