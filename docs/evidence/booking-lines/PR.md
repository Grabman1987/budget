The booking dialog previously separated categories, outlays and splits across
different controls. One line editor now supports a full category amount, whole
contact outlay, percentage/fixed contact shares and several categories/contacts.
It shows the exact rest and blocks incomplete or unbalanced saves. Existing split
order, signed amounts and metadata round-trip through the existing ledger writes,
locks and undo.

The visible head stays before the lines on desktop and phones. Date/repetition
use 2:1 columns with direct dates and a native calendar. Four slim suggestions
share one scrolling rail. Category/contact selection, inline contact creation and
Teilen replace the separate outlay/Split controls. Tab follows head, lines and
actions; Enter saves valid input and Escape preserves the existing dirty guard.
The phone header and footer retain 44px targets and stay inside the viewport.

Validation: 72 affected unit tests and 27 dialog browser/setup cases passed, with
all five scenarios on desktop, Chromium mobile and WebKit iPhone. Coverage includes
exact saved cents, edit round trips, rest guards, light/dark Axe, 44px targets and
viewport overflow. Web typecheck and the E2E application build passed. Broader
regressions and final CI are recorded in the evidence notes. Thirty synthetic
evidence images are included; Linux baselines are produced only in GitHub Actions.

![Desktop](https://raw.githubusercontent.com/Grabman1987/budget/feat/booking-lines/docs/evidence/booking-lines/desktop-several-0-light.png)

![WebKit iPhone](https://raw.githubusercontent.com/Grabman1987/budget/feat/booking-lines/docs/evidence/booking-lines/webkit-iphone-category-0-dark.png)

Refs #463