---
name: budget-ponytail
description: Review minimal, complete Budget code changes using the owner-requested Ponytail source.
---

Owner-requested source, read on 2026-10-15: [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail/blob/84740e3d344b69b4a133201fa519eb37a62a2b2a/skills/ponytail/SKILL.md), commit `84740e3d344b69b4a133201fa519eb37a62a2b2a` (MIT). This is a locally authored Budget adapter, not a vendored upstream package. See [provenance](../../../docs/skills.md).

Read the changed code, callers, tests, configuration and exports before proposing a fix. Use the existing domain, database and UI primitives. Prefer a direct, complete implementation; do not add dependencies, abstractions or speculative features merely to prepare for future work.

Review concrete correctness, safety, scale, test coverage, speed and unnecessary complexity. Each finding needs a reproducible case or a precise failing invariant. Preserve validation, integer cents, atomic writes, locks, audit and undo even when reducing code. A shorter implementation is not better if it drops an invariant.

Use `budget-verified-delivery` for verification and serial delivery. This profile does not install Ponytail's global plugin or hooks. The owner's existing delegation authorization and three-active-branch limit apply.
