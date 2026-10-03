# Automatic payslip intake verification

All PDF contents, account data, wage codes and Dropbox responses are synthetic.
PDFKit generates PDFs in memory with a dummy password; no private documents or
real provider credentials are used.

The desktop 1440 and mobile 390 screenshots cover the data-source settings and
expanded inbox draft in light/dark modes. They are review evidence, not visual
baselines. The browser scenario checks upload, document-period precedence,
salary-match preselection, confirmation, grouped undo, rejection and duplicate
upload. Axe rejects serious/critical findings and the page must not overflow.

Local commands (PowerShell uses `npm.cmd` / `npx.cmd`):

```text
npm ci --include=dev
npm run check -- -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
npm run build
npm run build:e2e
npx playwright test --config e2e/payslip-intake.config.ts
```

The extended unit-test timeout follows the existing Windows verification setup;
worker count is bounded on the owner's memory-limited machine. Set
`BUDGET_SPENDING_EVIDENCE=docs/evidence/payslip-intake` to retain screenshots.

The final local check on 2026-10-03 passed typecheck, ESLint, Prettier and all
2,254 tests across 235 files. Unit tests took 1,145 seconds under concurrent
machine load. A preceding default-five-second run hit timeouts; the final run
used the existing documented 30-second timeout, without relaxing assertions.

Production and E2E builds passed. The final isolated Playwright run passed both
desktop and mobile scenarios (1.4 minutes), including light/dark Axe and overflow
checks and the eight screenshots in this directory. The first browser rerun hit
the default five-second upload assertion on mobile just as success arrived; only
that assertion now waits up to 25 seconds, covering the 20-second PDF worker budget.
The changed test file passed ESLint/Prettier separately. Application behavior and
financial assertions were unchanged.

Task-scoped review covered authenticated/same-origin multipart routes, bounded
PDF/provider processing, server-only secrets, cursor/download integrity, migration
row preservation, atomic decisions and rollback, partial/forced undo guards and
retained receipt ownership. This is not a general security certification. The full
repository Playwright suite and Docker image smoke remain CI checks.

Private layout/mapping acceptance, live Dropbox OAuth, deployed Docker smoke and
an owner encrypted-backup restore remain separate from these local checks.
See [owner setup](../../payslip-intake.md).
