# Product foundation

Source review: 2026-10-15, integrated main commit `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`.

This is the reading entry point for Budget's product definition. It does not
replace the precedence in [SPEC](../../SPEC.md). Existing decisions remain binding;
new onboarding requirements below are proposals, not accepted scope or delivered UI.
The detailed planning package was completed against that application source on
2026-10-15; execution and owner acceptance remain separately tracked.

## Read in this order

1. [Foundation review](foundation-review.md): evidence, actual gaps and decisions needed.
2. [Product brief and requirements](requirements.md): purpose, boundaries, feature inventory and acceptance contracts.
3. [Current sitemap](sitemap.md): navigation grounded in the current router.
4. [First-use onboarding proposal](onboarding.md): from secure access to a usable first budget.
5. [Routine contracts](processes.md): triggers, steps, outcomes and failure paths.

## Detailed specification and handoff

| Need | Document |
| --- | --- |
| Individual functional rules and failures | [Functional contracts](functional-contracts.md) |
| Actor permissions, object states and recovery | [Lifecycle](lifecycle.md) |
| Data vocabulary, units, ownership and invariants | [Data contracts](data-contracts.md) |
| Ordered journeys and system/user handoffs | [Journeys](journeys.md) |
| Every report's question, source and acceptance | [34 report contracts](report-contracts.md) |
| Original KPIs and current rule registry | [27 metrics and 22 rules](metric-catalog.md) |
| Real Figma references and proposed first-use screens | [Screen contracts](screen-contracts.md) |
| Literal acceptance cases, matrix and gate evidence | [Acceptance plan](acceptance-plan.md) |
| Accessibility, security, source operation and restore | [Quality and operations](quality-operations.md) |
| Feature/source/test mapping and automated drift check | [Traceability](traceability.md) |
| Decisions, dependencies and executable work packages | [Delivery plan](delivery-plan.md) |

Start with the brief, sitemap and onboarding for product review. Use the detailed
contracts for implementation; use traceability and the acceptance plan for review.
The original concept remains historical context under SPEC precedence, rather than
an alternative set of current rules.

## Where the existing body of knowledge lives

| Question | Authoritative or supporting source |
| --- | --- |
| What was the original idea? | [Original concept](../concept/produktkonzept.md), especially chapters 2–6 and 11; historical where overridden |
| What wins when sources disagree? | [SPEC](../../SPEC.md), section 0 |
| What decisions and terms have been agreed? | [PRODUCT](../../PRODUCT.md); newer SPEC directives take precedence |
| Which functions are covered? | [FEATURES](../FEATURES.md); historical delivery notes need current-source verification |
| What detail is still open? | [REQUIREMENTS-GAPS](../REQUIREMENTS-GAPS.md) and this review |
| What is implemented, deployed or accepted? | [STATUS](../STATUS.md) and [ACCEPTANCE](../ACCEPTANCE.md), with their explicit snapshot dates |
| How are data and calculations represented? | [Data model](../data-model.md), schema, domain modules and linked feature contracts |
| How is the app operated and recovered? | [Operations](../ops.md) |
| What should it look like? | [DESIGN](../../DESIGN.md), versioned prototype/screens and the owner's supplied Figma reference |
| What is worked on next? | [ROADMAP](../ROADMAP.md) and linked issues/PRs |

## Documentation ownership

Keep this foundation beside the code so product changes are reviewable in the same
PR. Figma owns visual exploration and screen specifications; it must link to the
relevant requirement/process. Issues own executable work packages. A separate
Notion space can be a reading portal, but should not become a second independent
copy of financial rules.

For every changed behavior, record: requirement ID, process, route, design node,
implementation/API, independent acceptance example, evidence revision and owner
decision. Use explicit states: proposed, agreed, implemented, deployed, accepted.
An existing route, a test or a green deployment establishes only its own state.

## Maintenance rule

For a product change, update the binding decision once, then update its affected
process, acceptance criteria, design links and task. Date any historical evidence.
Do not silently rewrite the original concept or mark old gates accepted. The new
IDs in this folder are traceability labels, not automatic implementation tasks.
