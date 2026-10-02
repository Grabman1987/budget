# PWA baseline

Scope: installable application shell, static-asset offline availability and an
explicit update prompt. The existing Budget brand mark supplies the icons.

Only build-generated, same-origin static assets belong in Cache Storage. API,
authentication, exports and health responses must always use the network. An
offline start displays the shell's connection explanation without financial
figures; it must not imply that a booking has been saved.

An update waits for the user to finish their work and accept reloading. Passkey
ceremonies and `/health` retain their existing network behavior.

The offline booking queue is deliberately outside this baseline. Requirement
D07 still needs owner decisions on retries, idempotency and conflict recovery.
Physical iPhone installation and passkey acceptance remain separate checks.

The Vite build emits `sw.js` with a content-derived version and an explicit list
of build/static files. It precaches the shell and lazy chunks, never expands its
cache from runtime requests, bypasses `/api` and `/health`, and keeps one prior
shell for open tabs. Installation does not force activation. The user selects
"Jetzt neu laden" to activate the waiting worker; online/focus events check for
updates. Financial data remains memory-only under the existing Query client.

An offline launch does not mount financial routes. Losing the connection after
starting keeps unsaved fields mounted and labels displayed data as potentially
stale. This is not a durable offline save queue. Production-only registration
keeps the Vite development server unaffected.

The PNG icons rasterize the existing `BrandMark` SVG geometry in
`apps/web/src/shell/sidebar.tsx`, with padding for maskable launchers; no new
brand or remote image is introduced. Installation needs HTTPS (localhost is
only for tests).

Verification commands and results are recorded in the pull request; visual
baselines are not regenerated on Windows. The Chromium installability protocol
is used to check the manifest, icon and worker criteria directly; it is not an
invented Lighthouse score or physical iOS acceptance.
