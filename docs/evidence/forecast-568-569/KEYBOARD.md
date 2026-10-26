# #568 row-action keyboard evidence

Verified source `748a957cc6bc16f07c75a1b4e7157f45358eafcb`.
Root reports fresh build, scoped ESLint and Prettier PASS. Canonical native
WebKit configured light/dark: **5/5 PASS** (two feature cases and three setup),
55.4 seconds, no retry. Root independently reviewed the delta CLEAR.

Targeted command (canonical reproduction):

```sh
npx playwright test e2e/issue-568-569-forecast.spec.ts --project=webkit-iphone --workers=1 --grep 'Forecast35d configured'
```

The first strike is reached with actual Tab presses from the open tools summary,
asserted focused, then activated with Enter. No strike programmatic focus or
pointer click substitutes for this action. Existing hit-target geometry and all
literal amounts/dates, API response, audit Undo, unskip and money-state checks
remain. The second strike still uses the pointer, retaining both methods.

Primary synthetic receipts, copied unchanged from root's successful run:

| Artifact | SHA256 |
| --- | --- |
| [forecast-configured-light.json](keyboard/forecast-configured-light.json) | `875dc1311630fbf555ee4d85802321aa0c675b952c9fcf73377a3251dbede27c` |
| [forecast-configured-dark.json](keyboard/forecast-configured-dark.json) | `01b7d530c4a38a710b835ac26ed77318f4a61f3f695e6651a3428f0b43b86dfa` |

Receipts record actual configured390×664 WebKit geometry, coarse=true and raw
maxTouchPoints=0; this is browser emulation, not a physical-phone claim. Keyboard
proof comes from successful native test assertions at the pinned source, not
from a screenshot or the receipt alone. Original four-profile full-matrix
proof remains unchanged in [README](README.md). This targeted run adds the
missing row-action keyboard evidence; full exact-head CI/Chromium and live
delivery remain pending. No additional test execution is implied.
