---
name: budget-hallmark
description: Audit Budget UI with Hallmark while preserving its existing design system.
---

Owner-requested source, read on 2026-10-15: [nutlope/hallmark](https://github.com/nutlope/hallmark/blob/13ac0ec7e148655948100b6396439e481361d690/skills/hallmark/SKILL.md), commit `13ac0ec7e148655948100b6396439e481361d690` (MIT). This is a locally authored Budget adapter, not a vendored upstream package. See [provenance](../../../docs/skills.md).

Read the pinned upstream skill, `references/verbs/audit.md`, and relevant named anti-patterns. Use the audit verb for an existing screen: it reads context from the target and does not require another generic design interview.

Preflight the actual stack and read `DESIGN.md`: React/Vite, existing CSS tokens, Archivo/Barlow, Lucide and the project's motion rules remain authoritative. Review token drift, hierarchy, meaningful actions, readable figures, keyboard/touch access and responsive layout. This is an application, so marketing theme, hero, footer and cross-page theme-rotation rules do not redefine its structure.

Audit findings name the tell, file and line, severity, user impact and concrete correction. Separate source-only review from rendered checks and name unchecked viewports. The audit itself does not edit; implement accepted corrections within the authorized task and reverify them. Do not claim all upstream gates passed from a scoped review.

Do not hide a real overflow problem with global clipping, remove financial confirmations/undo, invent metrics or add real people/providers to satisfy generic advice. Upstream stamp-only or taste findings are documented separately from product regressions; existing project contracts take precedence.
