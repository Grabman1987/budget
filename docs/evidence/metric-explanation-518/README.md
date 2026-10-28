# Geldalter explanation: synthetic viewport evidence

The images come from the existing `e2e/report-tables.spec.ts` Sparquote/Geldalter case in focused [run 40640322201](https://github.com/Grabman1987/budget/actions/runs/40640322201). The tested source was `7a1c4633f3cd16aa5cf7b5a340c1657bf32b98f7`; the later change only reformatted the same paragraph, leaving rendered text unchanged. All three configured browser cases passed on the first attempt. The private run was red solely for source formatting; the exact formatting patch was independently reviewed before application.

| Image | Original profile/theme | SHA-256 |
| --- | --- | --- |
| `sparquote-desktop-light.png` | Desktop, light | `5457DE24FCEC21F65EF729E79EBA3AA1544B0EC09444A2A3BCF4A76A0AB54030` |
| `sparquote-webkit-iphone-dark.png` | WebKit iPhone emulation, dark | `77CA52455CA270990FF729F3CC7D92A33151FF5D53895FA54E68257CD1758CD8` |

These captures show the changed explanation is readable without a new note overlap. They do not establish physical-device behavior or resolve existing report title ellipsis and year-table scrolling.
