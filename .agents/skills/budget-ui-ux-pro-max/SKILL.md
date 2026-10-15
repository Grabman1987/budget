---
name: budget-ui-ux-pro-max
description: Use focused UI UX Pro Max research for Budget accessibility, charts and React UI.
---

Owner-requested source, read on 2026-10-15: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/56ea9cf174ed86786187daa9de0e6247cb0747e4/src/ui-ux-pro-max/templates/base/skill-content.md), commit `56ea9cf174ed86786187daa9de0e6247cb0747e4` (MIT). This is a locally authored Budget adapter, not a vendored upstream package. See [provenance](../../../docs/skills.md).

Read the pinned upstream skill template and inspect its Python entry point before execution. For a concrete design question, run the source checkout's `src/ui-ux-pro-max/scripts/search.py` with a short query and an explicit `--domain chart`, `--domain ux` or `--stack react`. The search uses local CSV data and Python's standard library; no installer or app dependency is needed.

Read the returned rows and judge their fit. If off-topic, refine once; report no useful match rather than presenting a weak match as evidence. Preserve the query and the applicable recommendation in the package evidence.

Budget already has a design system. Do not run `--design-system`, `--persist` or `--force`, replace tokens/fonts/Lucide, or install a chart library because a result lists one. Apply relevant accessibility and responsive guidance through existing components. Search recommendations are design input, not browser-test evidence.
