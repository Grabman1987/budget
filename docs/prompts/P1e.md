# P1e — Passkey login, security, deploy

Paste into a new cloud session after P1a and P1d are merged (model: Opus recommended — security).

---

Read `CLAUDE.md`, `SPEC.md` §9 (auth, security, hosting), concept section 11.2, and the P1e checklist in `docs/ROADMAP.md`. Login screens follow `DESIGN.md` (title block, blueprint tokens).

Task: secure single-user login and the first real deploy.

Scope (P1e checklist):
1. WebAuthn with SimpleWebAuthn: register several passkeys, login, list and revoke devices; ten one-time recovery codes (hashed); session cookie HttpOnly, Secure, SameSite=Strict, 30 days on registered devices; step-up re-authentication for export, bank connection and adding passkeys.
2. Bootstrap: the very first passkey can only be registered with a one-time setup token provided as environment secret `BUDGET_SETUP_TOKEN`; afterwards registration requires an active session plus step-up. No open sign-up.
3. Rate limiting and audit entries for auth events; CSRF-safe by design (SameSite + same-origin checks).
4. Litestream replication of the SQLite database to object storage; `docs/ops.md` with restore steps and a restore test script.
5. Deploy via the existing `deploy.yml` to the Fly app; `/health` green; the login page works on phone and desktop.

Never print, log or commit secrets. The owner creates the Fly app, the volume and all secrets himself (`docs/CLOUD-SETUP.md`); write the exact commands he needs into the PR description.

Acceptance: `npm run check` and e2e green (WebAuthn tested with the virtual authenticator in Playwright); boxes ticked; PR with the owner's setup commands.
