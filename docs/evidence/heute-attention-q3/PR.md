Today's repeated account-check rows pushed useful information below routine work. This change groups tasks into at most four source rows in **Zu tun**, combines dues into one nonempty **Fällig 14 Tage** list and summarizes Finanz-Check in a tile. Savings proposals keep their amount/date/account and execution-review action inside a collapsed inbox-row disclosure, including load-error feedback.

Decision 3B retains month navigation and Monat / Bis Gehalt. Other-month views use a short return line and label current-only information **Stand heute**. Calculations, integer-cent amounts, audited writes, locks and undo retain their existing paths.

Validation: web typecheck, changed-file ESLint/Prettier, CSS scale and E2E build passed; 4 affected Vitest files / 17 tests passed. Both grouped-work scenarios passed on desktop, Chromium mobile and WebKit iPhone, with light/dark Axe, 44px touch targets and no page overflow. Nineteen targeted regression tests passed including setup, preserving savings confirmation/cancellation/undo/redo, quote valuation, overspending counts and recurring payment creation/edit. The removed savings action was reproduced before repair. CI-generated Linux baselines and required PR CI are the final merge gates.

![Desktop light](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q3-heute-attention/docs/evidence/heute-attention-q3/desktop-light.png)

![iPhone dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q3-heute-attention/docs/evidence/heute-attention-q3/webkit-iphone-dark.png)

Refs #466
