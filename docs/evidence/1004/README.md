# Fine controls and fixed desktop inspector (#1004)

Synthetic sample ledger only. These review images were captured locally with the
redesign ON at 1440 px and 390 px, in light and dark themes. Component images crop
the shared-control section; Heute images show the complete page. They are review
evidence, not replacements for the Linux screenshot baselines.

| View | Desktop | Phone |
| --- | --- | --- |
| Heute, light | [1440 px](heute-desktop-light.png) | [390 px](heute-mobile-light.png) |
| Heute, dark | [1440 px](heute-desktop-dark.png) | [390 px](heute-mobile-dark.png) |
| Controls, light | [1440 px](controls-desktop-light.png) | [390 px](controls-mobile-light.png) |
| Controls, dark | [1440 px](controls-desktop-dark.png) | [390 px](controls-mobile-dark.png) |

The focused browser spec checks fine-pointer density, narrow and wide touch
targets, invalid field borders, keyboard rings, Axe on the shared controls,
period URL persistence, actual account/Plan controls, the primary-action
hierarchy, desktop inspector persistence, phone task wrapping and FAB clearance.
The dock checks both its 8 px minimum and a synthetic 34 px home-indicator inset.
WebKit emulation is covered; this is not physical-device acceptance.

The branch already had no right-inspector toggle. The remaining header control
collapses the left navigation; the tests verify that it cannot hide the right
column and that the Plan inspector remains visible after reload.
