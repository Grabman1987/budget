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

Implementation and verification results are recorded in the pull request.
