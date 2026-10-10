## Summary

Refs #311
Refs #312
Refs #313

- Bound a hanging passkey browser ceremony to 60 seconds, explain the pending state, request native cancellation and discard late credentials before server verification. Preserve existing retry/error/recovery behavior.
- Use the current server session's existing `viaRecovery` metadata in both profile labels; recovery never appears as a device passkey. Unknown/error status stays explicit.
- Show account-specific bank observation/source state in the title block, plus separate manual owner review and technical retrieval dates. Missing dates are unknown; absent live bank mappings are not configured. No connection or sync is started.

Builds on merged PR #405's liquidity/account-page changes. The shared changes are limited to one auth label hook and an optional per-account title-block field override, needed to remove contradictory fixed labels. No auth permissions, WebAuthn verification, session checks, rate limits, recovery restrictions, export step-up, migrations or dependencies changed.

## Validation

Targeted checks passed: web typecheck, changed-file ESLint/Prettier, CSS scale check, 61 Vitest tests, desktop 6/6 and mobile 6/6 browser checks (including setup). Task-scoped auth review and details: [evidence](https://github.com/Grabman1987/budget/blob/codex/pkg-g-auth-account-1009/docs/evidence/auth-account-1009/README.md). [Desktop](https://github.com/Grabman1987/budget/blob/codex/pkg-g-auth-account-1009/docs/evidence/auth-account-1009/account-dated-desktop-light.png) and [mobile](https://github.com/Grabman1987/budget/blob/codex/pkg-g-auth-account-1009/docs/evidence/auth-account-1009/account-dated-mobile-light.png) Chromium review images cover desktop 1440 and mobile 390, light/dark, accessibility and overflow. Native hanging-dialog cancellation is mocked; existing synthetic API tests use real server cryptographic verification. Cloud and physical-device observation remain separate.

Per package instructions, no full local check or full E2E suite; CI is the final gate. `build:e2e` ran once; an additional web-only build was needed after visual review exposed fixed shared header labels. No snapshot baselines were regenerated.

## Affected baselines

- `e2e/shell.spec.ts-snapshots/shell-heute-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-reports-light-desktop-linux.png`
- `e2e/shell.spec.ts-snapshots/shell-heute-dark-desktop-linux.png`
- Other full-page desktop application snapshots that include the sidebar profile method, and settings page snapshots with the profile title-block field. Review deliberately in pinned Linux CI.

## Owner steps

- After CI and PR #405 integration, review the synthetic desktop/mobile captures and affected Linux baselines.
- On real devices, check successful passkey login, cancel/absent/timeout dialog, retry and recovery; confirm the correct method label and unchanged full-export restriction.
- In the running app, confirm that manual review, technical retrieval and bank observation dates describe their actual sources.
- No new keys, consents, bank connection or sync are needed. No merge/deploy was performed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
