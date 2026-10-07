# Report verdicts: review evidence

Synthetic sample ledger only, Chromium on Windows. Desktop is 1440 × 900; phone
is 390 × 844. These captures show the shared verdict beneath the report header,
including an honest unavailable-data fallback. They are review evidence and do
not replace pinned Linux visual baselines.

| View | Capture |
| --- | --- |
| Desktop, light | [Image](desktop-light.png) |
| Phone, dark | [Image](mobile-dark.png) |

`e2e/verdicts.spec.ts` visits every report in groups 1–5 on desktop and phone,
checks the position and maximum sentence length, and checks both themes with Axe
and document-overflow assertions. Separate cases exercise reload, month change,
amount privacy, Heute and the One-Pager print header. The existing Gesamtübersicht
browser regression verifies its figures, inspection and CSV export as well.

The local browser run uses the existing seeded sample server through a temporary
config wrapper with one worker; unrelated empty-data/import servers are omitted
to limit memory use. The repository Playwright config and CI remain unchanged.
Owner language and actual-device acceptance, plus required CI, remain open.

See [report verdicts](../../verdicts.md).
