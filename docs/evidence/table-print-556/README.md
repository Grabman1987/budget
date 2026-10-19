# Shared table-report printing — #556

`TableReportFrame` applies one shared print stylesheet and named A4 landscape page with 10mm margins. Jahresansicht, Kategorieübersicht and Sparquote preserve complete columns, values, report titles and data-basis labels. Navigation and scrolling chrome disappear, native table header groups repeat, and existing print unfolding exposes remembered collapsed sections without changing screen preferences. One-Pager and Jahresreport retain their independent portrait sheets. Financial calculations and values, existing tests and browser configuration are unchanged.

The rules retain existing DESIGN roles. Automatic column layout keeps financial numeric tokens intact while compound delta markers may wrap between tokens. Normal surface/ink roles are declared only on the printed title/card containers and table roots; own muted, percentage, delta and heat roles remain. The merged [reduced-motion correction](../reduced-motion-481-595/README.md) removes the unintended positive-duration universal transitions. No descendant color reset, font shrink, reload or contrast/geometry waiver is used.

## Current verified result

Runtime source `7ff1b2e02807eeae67df530d425bd840e503a479`, including current main and the verified shared reduced-motion dependency, passed:

- **Actual pinned WebKit 27.2: 7/7, exit 0, 47.5s**, after a fresh E2E build (exit 0): three unchanged setup cases, Jahresansicht, Kategorieübersicht, Sparquote and the separate portrait-route case. Light/dark screen Axe, phone target/overflow checks, strict print Axe, complete column/header parity, every cell/paper bound, remembered-state restoration and strict DOM Range checks against broken numeric tokens passed.
- **Age-required full check: 505 files / 4491 tests, exit 0**, unit duration 382.04s; workspace type, lint and formatting checks passed. Node22.23.3 and age1.2.1, two Vitest workers, `BUDGET_REQUIRE_AGE=1`, with the shared full-check lock held through the production build.
- **Normal production build: exit 0**. All nine frozen source/test/document/image hashes and HEAD remained unchanged, the source tree was clean, and the lock release was verified. The final changes below are evidence/documentation only.
- Existing frame/section/name focused coverage had passed 3 files /25 tests; CSS-scale, scoped E2E lint and formatting checks passed. The existing nonfatal `panel.tsx:208` unused-eslint-disable warning and JSDOM `Window's scrollTo()` notices remain in the complete check log; no rule/test was suppressed.
- Independent source/merge reviews were clear. The author, coordinator and independent reviewers opened all three current actual print-media images and found no new actionable visual defect.

Actual inspected WebKit print-media captures:

- [Jahresansicht](jahresansicht-print.png): `44.222` and all month/comparison columns remain intact, with distinct semantic heat/delta roles.
- [Kategorieübersicht](kategorien-print.png): complete category/trend/detail values remain readable.
- [Sparquote](sparquote-print.png): labels, numeric tokens and age chart remain intact.

These images are print-media screenshots, **not PDFs**. WebKit does not establish physical PDF paper dimensions.

## Blank terminal PDF-page correction

The first canonical Chromium PDF failure was real: an earlier full actual-app diagnostic found 3/4/3 landscape report-content pages followed by one completely blank portrait terminal page in each report. Raw `/MediaBox`, independent PDF parsers and page-text extraction agreed. The outer document and trailing clipped live-status element used the default page while only the inner sheet selected the named landscape page.

The narrow correction adds `page:report-table` to the existing print-only `body:has(.report-table-print)` rule. The new PDF regression retains the original exact A4 landscape MediaBox checks and additionally requires every actual PDF page to contain report text. Marker-absent portrait controls retain their original checks; no page-size oracle was weakened.

At source `dce949d4`, a separate fresh full actual-app **system Chromium151 diagnostic** passed: report PDFs contained 3/4/3 landscape pages, each with text, and the actual One-Pager/Jahresreport controls remained A4 portrait at 1/2 pages. The print CSS and new PDF test are byte-identical in the current merged source. This is mechanism/candidate evidence, **not pinned canonical Chromium acceptance**; current canonical Chromium CI must establish the final engine/PDF gate.

## Remaining delivery gates

Exact-head canonical Chromium desktop/mobile CI, physical A4 landscape/portrait PDF verification, final evidence delta review, serial integration and deployed/live verification remain coordinator gates. No completed acceptance, merge, deployment or issue closure is claimed from local results.

```sh
npm run build:e2e
npx playwright test e2e/issue-556-table-print.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1
BUDGET_REQUIRE_AGE=1 npm run check
npm run build
```

Managed WebKit used the genuine pinned runtime, unchanged canonical configuration and only synthetic disposable local data. Enforced host CDN download restrictions remain; no alternative engine, skipped assertion, looser tolerance or real financial data was used as acceptance evidence.
