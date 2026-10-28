# Heute section states and phone viewport (#574, #575)

Base: `dfd441a82b93813a8168d8fbc442349a5ad79475`.
Semantic/test source: `c2922fcf2c55e5bfd9fad3c6dde277831a03cb9f`.
Reviewed formatting: `d6a9df6109c18f94c3b353b79b521231b367c0cd`.
Draft PR: [#817](https://github.com/Grabman1987/budget/pull/817).

## Read boundaries

Heute keeps its section slots and controls mounted while the aggregate read is
pending or unavailable. Its cached money and current-date claims are withheld.
The aggregate retry names the sections that depend on that read.

The existing selected-month budget, current liquidity forecast and savings
proposal queries retain their independent successful content. Each also withholds
its own cached figures and actions during its own fetch/error. Selected-month
budget availability keeps its original meaning. Funding notes use only a verified
request month as labelled context, with separate ready gates for their existing
budget and goal reads. No aggregate DTO, current date or financial zero is invented.

Native proposal disclosures retain their existing visible/remaining parent during
an unrelated aggregate outage; only that placement enum is remembered. No old
aggregate tasks, counts or money are retained. Empty goal slots are aria-hidden.

Phone KPI values now use their intended single-row grid placement. Heute spacing
uses existing tokens; type sizes, figures, explanations and source links remain.
Loaded and placeholder Pace headers share natural center alignment so the SVG
status icon does not change the header's baseline height. State icons keep their
ordinary size and do not obstruct Retry. Financial math, API contracts, writers,
storage, navigation and FAB behavior are unchanged.

## Tests and actual evidence

- `section-states.test.tsx`: real SQLite API/QueryClient integration covers main
  pending/error/refetch, independent read gates, exact money literals, no writes,
  empty goals, current-only stamps and connected/open proposal disclosure nodes.
- `offline-wealth-comparison.test.tsx`: the existing snapshot stamp is asserted
  against `fetchedAt`; null/zero/signed comparison checks remain.
- `valuation-attention-511.test.tsx`: only its fixture return type is narrowed to
  non-null because the component now also accepts an absent aggregate.
- `issue-574-heute-section-states.spec.ts`: exact four-section pending/ready bounds,
  independent forecast reservation, isolated failures/retries, overflow, Axe and
  phone targets. Failure diagnostics report element boxes without financial text.
- `issue-575-heute-phone-viewport.spec.ts`: actual Pace start at 390×844 plus the
  configured WebKit 390×664 viewport, default/open fold end clearance, observed FAB
  scroll direction, both themes, Axe and targets. This is browser emulation.

Tests-first unit RED `40685904888` had five specific old-state failures. Browser
RED `40688680847` reproduced missing sections, collapsing forecast geometry and
Pace below the phone viewport. Later failing proofs exposed and corrected error
icon overflow, placeholder sizing, a fixture notification wait and header baseline
differences. These runs are failures, not passing evidence.

Final focused run `40711605148` tested semantic source `c2922fcf`: all 110 tests in
13 unit/API/fixture files passed; all 12 browser results passed (9 actual cases
across desktop/mobile/WebKit plus 3 setup cases). Typecheck, build, discovery,
candidate lint, cleanup and formatter idempotence passed. The run remained RED
only for formatting before the reviewed mechanical patch was applied.

The 95,129-byte patch SHA-256 is
`693e01efd8a827e417c8ccd45d5b4c4da49ce0b92fc0449f913bdb5f698c2dd2`.
Independent HIGH review read all 45 hunks before application. Root verified the
patch hash, clean-source application check and all nine candidate identities. All
nine post-format source/test Git blobs match the independently reconstructed
candidate manifest. No local runtime or formatter was used by the author.

## Unchanged gates and pending work

The original desktop 900px gate protects the three KPIs and both plots. The new
duplicate check uses those same selectors; exact full-four-section state equality
also remains. Phone first-screen, 44px targets, fixed-control clearance, privacy,
financial literals, dates, keyboard, Axe, overflow and retry checks are not waived.
No baselines or original #572/#575 thresholds were relaxed.

Fresh exact public full CI, live verification and independent issue acceptance
remain pending. Initial PR automation `40713133462` was intentionally cancelled
before the final formatted head/risk-label context; it did not pass. Focused proof
does not establish full CI, deployment, live behavior or completed acceptance.
