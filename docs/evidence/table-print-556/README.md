# Shared table-report printing — #556

`TableReportFrame` applies one shared print stylesheet and named A4 landscape
page with 10 mm margins. Jahresansicht, Kategorieübersicht and Sparquote retain
all columns, values, report titles and data-basis labels. Navigation and scrolling
chrome disappear; native table headers repeat. Existing print unfolding exposes
collapsed sections without changing saved screen preferences. One-Pager and
Jahresreport keep their independent portrait sheets. No per-report print layout,
financial calculation/value, existing test or browser configuration changes.

The rules use existing DESIGN tokens. Automatic column layout keeps financial
numeric tokens intact, while compound delta markers can wrap between tokens.
Normal surface/ink roles are reapplied only on the actual printed title/card
containers and table roots: genuine WebKit dark-screen→print previously retained
stale inherited/painted colors. Own muted, percentage, delta and heat roles are
preserved; no descendant color reset, font shrink, timing workaround, reload or
contrast/geometry waiver is used.

## Verified result

Source `f89a8bcae732cb3bece12dd6ad1d70c735c6d9fd` (evidence-only head
`a1d436d6597792f91e90e6113e05a597a278ce1d`) passed:

- Genuine pinned **WebKit 27.2: 7/7, exit 0**, 59.2 seconds: canonical setup 3,
  Jahresansicht, Kategorieübersicht, Sparquote and the separate portrait-route
  case. Screen light/dark Axe, phone targets/overflow, strict print Axe, full
  column/header parity, every cell/paper bound, saved-state restoration and a
  strict DOM Range check against numeric-token line breaks passed.
- **Age-required full check: 481 files / 4382 tests, exit 0**; all workspace type,
  lint and formatting checks passed. Unit duration 397.51 seconds, two workers
  under the shared full-check lock. The existing unrelated `panel.tsx:208`
  unused-eslint-disable warning remains unchanged (zero lint errors).
- **Production build: exit 0**. All seven source/test/doc/image hashes remained
  unchanged through the full check/build, and the working tree was clean.
- Existing frame/section/name targeted coverage had also passed 3 files / 25 tests.
  Scoped E2E build, ESLint, CSS scale, Prettier and diff checks passed.
- Independent whole/delta review and final native artifact review were clear;
  reviewer and coordinator opened all three actual print images. The following
  result-only documentation update requires its separate final delta review.

Actual inspected print-media screenshots:

- [Jahresansicht](jahresansicht-print.png):`44.222` remains intact, with complete
  comparison columns and semantic heat/delta roles.
- [Kategorieübersicht](kategorien-print.png)
- [Sparquote](sparquote-print.png)

These are genuine WebKit print-media screenshots, **not PDFs**. Canonical
Chromium desktop/mobile checks and actual A4 landscape/portrait PDF MediaBox
checks remain open. WebKit cannot establish physical PDF paper geometry. Final
CI, integration and live verification remain coordinator gates; no complete
acceptance, merge, deployment or issue closure is claimed.

## Reproduction

```sh
npm run build:e2e
npx playwright test e2e/issue-556-table-print.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1
BUDGET_REQUIRE_AGE=1 npm run check
npm run build
```

The managed environment used the genuine pinned WebKit runtime with unchanged
canonical Playwright configuration and synthetic disposable local data. Direct
host Chromium downloads remain blocked by the enforced CDN redirect policy;
canonical Chromium CI supplies the remaining engine/PDF evidence. No substitute
browser, skipped assertion, relaxed tolerance or real financial data was used.
