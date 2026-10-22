# #489 D-37 production gallery flag — independent security/source review

Reviewed **8a534c8de543ba2e8c72a264c3c8dec2a357577d** against **c16eb406451e3aa31c6afcb2abcf5018af408a6e** in `/workspace/impl-489-overview-design`. Scope: all six changed files plus existing auth, SPA/static delivery, API middleware, client auth status and service-worker cache source. **Two bounded P2 corrections are required.** No HTTP requests, tests, checks, build, browser, CI or implementation were performed. #719 STOP remains unchanged.

## Findings

### P2 — successful gallery SPA delivery loses `no-store`

`apps/server/src/app.ts:151–158` sets `Cache-Control: no-store` for the canonical enabled gallery and continues through owner-session authentication. The normal `/dev/bauteile` delivery then reaches the SPA fallback, which unconditionally sets `Cache-Control: no-cache` at line 251 before serving `index.html`. That overwrites the required non-storage policy on the successful authenticated response. `no-cache` permits storage subject to revalidation; it is not `no-store`. Unauthorized and denied paths do retain their early no-store header.

Minimal correction: preserve/enforce `no-store` on the enabled gallery's final response, including fallback/error/HEAD handling, without weakening other static asset behavior. An outer middleware can restore the header after `await next()`, or the fallback can explicitly respect the protected response policy. No additional role or permission flow is needed.

### P2 — decode-depth exhaustion falls through instead of failing closed

`apps/server/src/app.ts:144–151` decodes at most four times, then classifies the partially decoded path. Example source path `/%2525252564ev/bauteile`: after four iterations it is `/%64ev/bauteile`, which does not match `/dev`, `/dev/` or `/dev%`. It therefore reaches static/SPA delivery instead of the documented 404/no-store rejection for encoded gallery aliases. This also occurs when the operator flag is off. There is no demonstrated owner-session bypass here—the client route still has an authenticated probe—but the claimed server-side alias refusal is incomplete.

Minimal correction: if normalization cannot finish within the chosen bound, reject the request with 404/no-store rather than inspecting an unresolved escape sequence. Keep the exact canonical GET/HEAD allowlist and current session gate. Do not add arbitrary unbounded recursive decoding or assume every downstream parser has the same decoding depth.

## Source conclusions outside those findings

- The runtime entrypoint enables the option only for the exact environment value `BUDGET_BAUTEILE_ENABLED=1`; absent/other values are false. `createApp` defaults it off. Production enablement without an AuthGate throws before app creation. The normal entrypoint also retains production origin/pepper validation and does not create an unauthenticated alternative gallery service.
- Canonical production GET/HEAD `/dev/bauteile` is admitted only when enabled and then passes through the existing `requireSession` before static/SPA serving. Other recognized dev paths, encoded canonical aliases within the normalization bound and non-read methods are refused before static fallback. The existing owner-session model is reused, including recovery-session semantics; D-37 does not require a new role/step-up policy.
- The access probe is mounted only with production enablement. Its route comes after existing `/api` no-store, body/origin/session guards and before the final API 404. Disabled/unconfigured states do not return an enabled probe. No data mutation, credential return or financial reader was added.
- Production SPA entry checks auth state and then performs a same-origin, no-store probe. Cached auth status alone is insufficient to enter: a stale successful status still meets the live API session check. Probe 401 clears financial query/device data and redirects, 404 rejects the route, and other failures do not load the gallery. The service worker explicitly bypasses API requests, so its precache cannot manufacture a successful access probe. Offline navigation can load the common public app shell but cannot complete the new network-dependent guard.
- The gallery uses synthetic fixtures and is now a bundled lazy production route. Public hashed JS/CSS assets and the build-only PWA shell are not secret; bundling alone is not authorization to render the route. Other developer routes remain dev/e2e-only, and production gallery links to them are removed. Existing CSP, sourcemap-disabled build configuration, session/origin guards and financial APIs were not relaxed.

## Limits and disposition

This is a pinned source review, not evidence from executed HTTP/path-normalization/cache/browser cases. No repository files were edited by the reviewer. Correct the two narrow server middleware issues, then review that delta. Existing runtime/accessibility/delivery gates and #719 STOP remain in force; no new owner policy decision is required.
