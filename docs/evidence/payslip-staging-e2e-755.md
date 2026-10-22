# PR755 test adapter — staged payslip review locator

**Changed file:** `e2e/payslip-intake.spec.ts`.

CI run `39771059532` reported three phone-project failures while waiting for status text `PDF ausgewertet` at the upload staging waits. That text is obsolete. The current successful upload renders `PayslipIntakeDetail` inline in the existing upload dialog, where the original-PDF download link appears only after the staged intake record has loaded.

Both waits now locate `Original-PDF herunterladen` inside the already-scoped upload dialog. This covers the initial encrypted upload plus the chooser and drop variants (desktop and mobile project runs share these selectors). It does not change a product file, finance expectation, booking/Undo assertion, rejection or duplicate assertion. Both existing 25-second timeouts remain unchanged.

The change is a technical locator adaptation under the existing test-adapter authorization. No E2E test was run locally; rerun on the revised head is pending. Independent review is pending.
