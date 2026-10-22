# #487 print-grid correction source review

Reviewed commit `8978fa30a944cd3d74fa29327f5a520e9c39a38a` against `ac5e55291ffe55c7872ab43c1407d7b117afe480` in `/workspace/impl-487-portfolio-report`, against the prior finding in `487-source-review.md`. Read-only source/Git inspection; no tests, checks, typecheck, build, browser, or runtime validation.

**Scoped source review: no finding in the correction delta.** `apps/web/src/pages/portfolio-performance-comparisons.tsx:188-222` keeps the on-screen return grid inside a closed-by-default `<details>` and adds a print-only `ReturnGridTable` outside that disclosure. The CSS at `apps/web/src/pages/portfolio-performance-report.css:179-189` hides the print copy on screen, then hides the disclosure and shows the print copy in print media. Therefore the prior omitted-grid case is resolved in source for both initially closed and manually open disclosure states; printing does not mutate the disclosure's state.

Both copies use the same `ReturnGridTable` (`portfolio-performance-comparisons.tsx:237-316`), preserving monthly unavailable labels, partial-period markers, signed heat classes, canonical `year.rate`, and each benchmark's `benchmarkRate`. The print copy passes no `chartPoints` flag, so it has no chart-point attributes; the shared table adds no IDs or controls. The only other changes are the package's NOT VALIDATED note and archived pre-fix review.

This is **not runtime or print-layout validation**. A later browser print pass must still assess page width, pagination, and actual sheet output; the full #487 package remains not validated.
