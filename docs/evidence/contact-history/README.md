# Contact history and monthly payments

The screenshots use the synthetic ledger created by `e2e/contacts.spec.ts`. The test records two
September outlays, a partial repayment, an October repayment, and an explicit final settlement.
It checks that the contact balance link opens the same statement as the name, October payments
remain itemized with their saved allocations, and older outlays appear in closed history only after
the explicit recorded clearing. Domain tests also cover the independent 5,500-cent open balance
case and reject inferred legacy receipts as a history boundary.

The browser test checks Axe in light and dark mode at desktop, Chromium mobile, and WebKit iPhone
viewports. Screenshots show the statement with the historical section expanded:

Mobile and WebKit screenshots retain the application's fixed bottom navigation and booking
button. The full-page capture can place that viewport chrome over rows it crosses; this is the
unmodified app chrome, preserved in the evidence.

- `statement-desktop-light.png` and `statement-desktop-dark.png`
- `statement-mobile-light.png` and `statement-mobile-dark.png`
- `statement-webkit-iphone-light.png` and `statement-webkit-iphone-dark.png`
