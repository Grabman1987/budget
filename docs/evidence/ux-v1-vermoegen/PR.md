## Changes

Vermögen now starts with the figures that answer each page's question: portfolio value/gain and annualised time-weighted performance, total debt and actual history, and an immediately available freedom projection with an editable historical saving default. Chart ranges sit next to the charts. Trade history uses a compact table; savings details show the next version-aware planned execution, recorded purchases and a collapsed rate history.

Existing calculation sources, integer cents, guarded forms, booking writes and undo remain in place. Purchase totals explicitly include manual buys in the same instrument/account since the first plan version, and do not claim a confirmed bank execution. Shared changes are limited to removing the wealth header's period field, extracting the existing report query for reuse and admitting this package's spec to WebKit.

## Validation

Web/DB typechecks, ESLint, Prettier, 23 affected unit tests and the single E2E build passed. The package Playwright run for desktop/mobile/WebKit failed before tests: tsx could not start the synthetic server (uv_os_get_passwd / ENOMEM). Browser/Axe/touch/overflow acceptance and screenshots remain open. Exact results are recorded in [evidence](docs/evidence/ux-v1-vermoegen/README.md). No full local check or full E2E suite was run, as required by the package's memory constraint. CI is the final gate. No local visual baselines were regenerated; portfolio, debt, freedom and savings-detail snapshots require CI review.

## Delivery status

Local Git metadata writes are blocked: git add/commit cannot create the worktree index.lock (Permission denied). No commit, push or PR was created. This file is the prepared PR body.

## Owner steps

Rerun e2e/wealth-ux-v1.spec.ts on desktop/mobile/WebKit when runtime resources are available, inspect its synthetic desktop/phone images, and review required CI before merging. No migration, credentials, provider consent or bank order is required by this change. Existing bank savings schedules still need to be managed by the owner.

Refs #480

🤖 Generated with [Claude Code](https://claude.com/claude-code)
