# #486 durable CSV export observation — source-only review

Reviewed `f1b1310d094bbe5e38d348c354b0872e605b52c3` against `f0cf0a7fecd51ed6d119497982135539c87cfa56` in `/workspace/impl-485-486-settings-navigation`. Scope: the three changed paths (`apps/server/src/api/export.ts`, `apps/web/src/pages/export-placeholder.tsx`, `docs/implementation/settings-485-486-NOTVALIDATED.md`) plus relevant existing audited setting and write-hold helpers. No actionable finding in this scoped source review.

The new persistence branch runs only after the ZIP iterator reaches `done`, `finish()` completes private snapshot cleanup and releases admission, and `controller.close()` succeeds (`apps/server/src/api/export.ts:865-895`). It skips an observed abort/cancel and held writes. Any setting-write failure is caught after response closure, so it cannot convert that response to a failed export. Existing snapshot, step-up, admission, abort and error paths are outside the changed branch.

`/status` reads a single audited `app_setting` value and returns it only if it is a canonical ISO timestamp (`export.ts:46-53,732-739`). The transactional comparison prevents an older completed timestamp from replacing a newer valid one; the update uses existing `createEntity`/`updateEntity` audit helpers. The key and value contain no filename, path, CSV content, credential or payload. The UI describes a recorded *server-side* completion and explicitly does not claim device save or restore proof (`apps/web/src/pages/export-placeholder.tsx:90-91`).

This is static source reasoning only. Abort/transport timing, write-lock races, metadata-write failures and persistence across restart remain unvalidated in execution; no tests, checks, typecheck, build, browser, or CI were run.
