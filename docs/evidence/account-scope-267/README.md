# #267 account-scope evidence

The current Windows browser run is on source head `8cb8317967cf5e7546924d6f8922ad45049a9130`. Focused tests passed: 47 tests across four files in 18.16 s. The isolated browser run passed on desktop and mobile (15.1 s and 20.0 s, plus three setup checks; five passed total in about 1.3 min). The run covers the positive-liquidity segment's real pointer interaction, synthetic account-scope labels and forecast explanation, and the existing privacy, Axe, and horizontal-overflow assertions. It does not establish a Linux pixel-baseline run, full repository check, or physical-phone acceptance.

The earlier browser attempt had a genuine pointer failure: the SVG parent intercepted the click on the positive segment. The UI now renders a transparent 44 px hit rectangle within each interactive positive segment, preserving its horizontal bounds and leaving the negative row separate. The current desktop/mobile pointer checks passed with that hit area; no forced click was used.

The eight reviewed captures below are copied from this run's `test-results` output. They show the account-scope and Heute states in light and dark themes on desktop and mobile. Hashes are SHA-256 of the copied PNG files.

| Capture                                                         | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Desktop account scope, light](desktop-account-scope-light.png) | `DC3C887B40B881CF71E676CA462F27CC4C27E8B33157FF11C62AE54A83BA7A39` |
| [Desktop account scope, dark](desktop-account-scope-dark.png)   | `5B6B8C912ADD8E2CA25908C582AEAC637D5B7A2EFD78388A68AE3A7C8E86E579` |
| [Desktop Heute, light](desktop-account-scope-heute-light.png)   | `6A4C82A77A835B035FF18811275FFDC00ECB1001986D9250964050129A4712C9` |
| [Desktop Heute, dark](desktop-account-scope-heute-dark.png)     | `4BF4753ACCD365F6AE36C92A9B52DFA1BA79BD9E7C6D01E6F789E6C802CCB6D9` |
| [Mobile account scope, light](mobile-account-scope-light.png)   | `7DF4D72642173909F9C291433EED8FE291B67C9469F5DE6367ED4EB296F7CAC8` |
| [Mobile account scope, dark](mobile-account-scope-dark.png)     | `1D9AA2D5BB647465EE9668B0821D07785B1EB027A0AB347F9198BBB9CB7C2C53` |
| [Mobile Heute, light](mobile-account-scope-heute-light.png)     | `A434EC8A005EEF5B5605FA99FFA5D8DE0165430E4489A5AA6D159294AB1D0D9A` |
| [Mobile Heute, dark](mobile-account-scope-heute-dark.png)       | `618EA66D243E5D741DD0A60B0902B500FE97DED8FEDBA9EE1A21F81C150E066F` |

All captures were reviewed by the lead. They are Windows browser evidence; no Linux screenshot comparison or physical device claim is made.
