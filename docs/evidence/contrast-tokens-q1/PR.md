Faint field borders, small metadata and dark positive fills were difficult to distinguish. This corrects DESIGN.md and regenerates the shared tokens: control boundaries and meaningful secondary lines reach 3:1, normal text reaches 4.5:1, and positive dark fills retain readable foregrounds. Hover/selection metadata uses stronger ink. DS1 retains ownership of the full teal/orange palette.

Validation after integrating current main (Z1, V1 and Q3): web typecheck, changed-file ESLint/Prettier, CSS scale and E2E build passed. All 29 token/contrast unit tests passed again, covering all normal surfaces, alpha-composited tints, positive-hero remapping, system/forced dark and print. Six browser scenarios passed on desktop, Chromium mobile and WebKit iPhone (9 including setup), with light/dark Axe, actual viewport-width guards and 44px phone form targets. E2E build passed; required CI and Linux visual baselines gate the merge. Synthetic evidence is in docs/evidence/contrast-tokens-q1/.

![Desktop light](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q1-contrast-tokens/docs/evidence/contrast-tokens-q1/desktop-light-capture.png)

![iPhone dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q1-contrast-tokens/docs/evidence/contrast-tokens-q1/webkit-iphone-dark-capture.png)

Refs #464
