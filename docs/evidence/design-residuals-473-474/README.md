# Design residuals: Sankey values and Plan suggestion

These screenshots use the repository's synthetic sample data for the Sankey chart and an isolated synthetic ledger for the Plan suggestion. They were captured by the focused browser proof [40625715142](https://github.com/Grabman1987/budget/actions/runs/40625715142) from source commit `f7fdf696a3a7c9b8a34a3d0c2786c4a7dd5bd084` with snapshot updates disabled. The subsequent source commit only formats the new browser test. The browser proof passed 19 tests on the first attempt; its overall result was red solely because Prettier flagged that test before the mechanical formatting correction.

| Changed view | Desktop light | WebKit iPhone dark |
| --- | --- | --- |
| #473 Sankey numeric labels | [Image](sankey-desktop-light.png) | [Image](sankey-webkit-iphone-dark.png) |
| #474 Plan suggestion ghost button | [Image](plan-ghost-desktop-light.png) | [Image](plan-ghost-webkit-iphone-dark.png) |

| File | SHA-256 |
| --- | --- |
| `sankey-desktop-light.png` | `8FB7B98B31484B8CAA7109BA938F429239685FF8FFACE16CD041C932966F4474` |
| `sankey-webkit-iphone-dark.png` | `F883C6524317FAD0F7835104F35A965B0E19CFD145A3DEC8E399AED31F492CCD` |
| `plan-ghost-desktop-light.png` | `0F5F65104905FC606CE81235DD9FC58BFE8A984E343390220BD9F63EB77EB73C` |
| `plan-ghost-webkit-iphone-dark.png` | `13A14A3F9C4BC17D22FF14AFC88344783EBEADFF2A7EAC3159738B595FFF3A1D` |

The screenshots document these changed states in browser emulators. They do not establish physical-device behavior or completion of the broader #473/#474 design-system criteria.
