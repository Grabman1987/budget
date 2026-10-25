---
name: budget-diagram-design
description: Review quantitative Budget charts using Diagram Design without changing the app identity.
---

Owner-requested source, read on 2026-10-15: [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design/blob/d97c5c7477e54cee17cfa6459190610da0643a05/skills/diagram-design/SKILL.md), commit `d97c5c7477e54cee17cfa6459190610da0643a05` (MIT). This is a locally authored Budget adapter, not a vendored upstream package. See [provenance](../../../docs/skills.md).

Read the pinned skill and matching type reference (bar or line for current wealth/report work). Apply its honest-data and legibility review to the existing chart components: shared scales, zero baseline for magnitude comparisons, signed positions, truthful labels, visible gaps for missing data, no spline interpolation of sampled values, and readable axes at actual rendered size.

Use real time distances for irregular dates. Never move a data point to avoid a collision; fix the label layout. Retain exact integer-cent source data and derive display geometry only. Use independent expected values, keyboard/touch values and light/dark rendered checks. Color alone must not carry sign or series identity.

The upstream example skin, tiny export label sizes, series/bar caps and chart libraries do not replace `DESIGN.md` or silently aggregate financial data. Existing Budget tokens, ChartSvg and responsive components remain authoritative. For a new standalone diagram, first choose its audience and medium, then follow the relevant upstream creation/verification workflow; do not claim its standalone SVG checkers verified a React chart.
