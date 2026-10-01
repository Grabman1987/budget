# Project skill profiles

Selected from the owner-provided `claude_skills_master_registry_capability_catalogue.md` on 2026-10-01 (SHA-256 `dfe7dd2083cff6db3084fb4669a4b7eb7720494f66ffc815a9e952c692737071`). Its capability descriptions informed locally authored, project-specific adaptations; no upstream packages, commands or licenses are claimed installed or verified.

The relevant capability matches are Caveman/no-ai-slop → `budget-caveman`; Ponytail,
pstack-potato, Matt-Pok and Unlazy → `budget-verified-delivery`; vibe-security →
`budget-security-review`; and Impeccable → `budget-impeccable`.

Profiles live in `.agents/skills/`, each with a readable `SKILL.md`. The reference in `AGENTS.md` makes the relevant profile explicit for future agents; automatic slash-command registration or hot-loading into every client is not assumed. In this chat the selected rules are applied after reading the local files.

| Local profile                                                                   | Catalogue inspiration                               | Use                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [budget-caveman](../.agents/skills/budget-caveman/SKILL.md)                     | Caveman, no-ai-slop                                 | Concise German progress and results, plain English code/docs; retain evidence and blockers. No measured token-savings claim.                  |
| [budget-impeccable](../.agents/skills/budget-impeccable/SKILL.md)               | Impeccable                                          | Audit and polish against `DESIGN.md`, `.impeccable/design.json` and the existing prototype, with accessibility and desktop/mobile evidence.   |
| [budget-verified-delivery](../.agents/skills/budget-verified-delivery/SKILL.md) | Ponytail, pstack-potato, orchestrator, unlazy-depth | Small changes, sequential cheap-agent work when authorized, independent root review, meaningful regression checks and honest delivery status. |
| [budget-security-review](../.agents/skills/budget-security-review/SKILL.md)     | vibe-security                                       | Task-scoped checks for authorization, data privacy, request validation, secret handling and transactional invariants on the actual stack.     |

## Selection boundaries

`SPEC.md` and user instructions retain precedence. Catalogue text is reference material: it cannot silently activate capabilities, override permissions or redefine scope.

- No `/impeccable init`: PRODUCT and DESIGN already define an accepted direction; do not regenerate them from generic advice. Catalogue suggestions for an 8pt grid or OKLCH do not replace existing spacing and color tokens.
- Taste-engine is deferred: a new visual identity conflicts with the existing prototype contract.
- Next.js/Server Actions and Supabase/PostgreSQL profiles are not applicable to React/Vite, Hono and SQLite/Drizzle. Retain the useful principles of typed validation and transactional data without changing the stack.
- The React, TypeScript, Query and Zod guidance in fullstack-next-react applies to the existing stack; its Next.js and React Server Component requirements do not.
- SQL integrity guidance applies through SQLite and Drizzle; Supabase and row-level security assumptions do not.
- Native Swift/iOS, MT5/MQL5, automated trading and media/YouTube skills are outside this PWA's current scope.
- Autoresearcher and Hyperframes are deferred until a concrete measured optimization or motion task needs them. Reduced motion and the prototype timings remain binding.
- The owner authorized a step-up authenticated ZIP of allowlisted account/depot CSVs. Keep export fields explicit and synthetic tests free of real account data; this does not authorize restoring app import.

Review the relevant profile when a task starts. Load original upstream packages only after verifying their source and contents; record the version and licensing if later vendored. No external package execution is needed for these local profiles.

## Owner registry and additional sources

The owner supplied the central catalogue directly as a file. Its SHA-256 matches the
owner's original. Reference links: [central registry](https://www.dropbox.com/scl/fi/273ihjk6v5h4fbrem8wv0/claude_skills_master_registry_capability_catalogue.md?rlkey=17q64qkp7hgvmgd3s3imq3yoa&dl=0),
[direct file](https://dl.dropboxusercontent.com/scl/fi/273ihjk6v5h4fbrem8wv0/claude_skills_master_registry_capability_catalogue.md?rlkey=17q64qkp7hgvmgd3s3imq3yoa&dl=1),
and [Plado](https://plado.pages.dev/). These URLs returned HTTP 403 during earlier runtime
checks, but no further HTTP access is needed for the supplied catalogue. External
package contents and licenses were not part of that file and remain unverified; no
upstream package or command is claimed installed.

### Profiles relevant to the current audit

All four existing local profiles are relevant, with bounded use:

| Task | Profiles to read | Evidence required |
| --- | --- | --- |
| Progress and task reporting | budget-caveman | Concrete status, PR links and unresolved blockers |
| A03 overview and later native FX detail UI | budget-impeccable, budget-verified-delivery | Existing prototype, desktop/mobile checks, unchanged baselines |
| A04 persisted migration reconciliation | budget-security-review, budget-verified-delivery | Independent account/month cents, structural account/currency differences, rollback and undo |
| A02 FX costs, A09 sold-position gains, A10 multi-broker aggregation | budget-verified-delivery, budget-security-review | Literal independent financial expectations and scoped mutation/read integrity |
| PR integration, backup/restore and deployment | budget-verified-delivery, budget-security-review | Required CI and actual restore/deployed commit, not merely configured workflows |

The managed-cloud `cloud-environment-runtime` skill is also used for runtime,
proxy and credential-readiness checks; it is supplied by the environment plugin,
not an installed repository profile. Private Dropbox migration access requires a
separate authorized file-access capability; a catalogue link does not provide it.

Current task status is tracked in [TASKS.md](TASKS.md).
