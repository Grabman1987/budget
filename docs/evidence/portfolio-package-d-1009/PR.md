## Summary

Portfolio percentages now state their market-value, net-allocation and gross-risk
bases, including signed cash. Empty instruments are collapsed with a count and
keep their existing detail/edit paths. Unclassified holdings link to the shared
assignment editor; the optional benchmark chooser explains portfolio-only mode.
Current class metrics precede accessible historical/unused classes, and report
sources and secondary summaries follow the main content at full width.

## Issue mapping

- Refs #297 — label the existing denominators and explain negative cash, leverage
  and shares outside 0–100%; no formula unification.
- Refs #298 — native closed catalog with count; complete list, keyboard toggle and
  existing deep links and editing paths retained.
- Refs #299 — instrument-specific links to the shared dated classification form,
  cash links to account settings; distinct estimated/stale counts and provisional
  optimisation guards retained.
- Refs #300 — explicit optional setup state; preserve persisted checkbox selection
  and clearing, without an implicit benchmark.
- Refs #301 — held classes at the displayed stand versus collapsed historical and
  unused classes. The existing valuation series supplies a presentation-only
  holding flag, including excluded and zero-cent positions; historical return
  methods and lifetime realised gains remain unchanged.
- Refs #346 — allocation legend/source tables and cost summary stacked at full
  width; numeric columns, filters and direct links retained. Other Portfolio
  report outer layouts already stack; depot and metric comparisons stay intact.

## Validation

- Web, DB and server TypeScript; scoped ESLint/Prettier; diff whitespace checks.
- Five affected Vitest files: 30 tests passed, including RED/GREEN dated holding
  regressions, an excluded position rounding to zero cents, and retained existing
  risk/performance calculations.
- E2E build passed; focused web/server rebuilds cover the subsequent holding-flag
  correction. Final affected desktop and mobile specs: 7 passed per viewport,
  including three setup cases each. Axe, overflow, 44px targets, native collapse,
  editor navigation, benchmark persistence/clear, historical rows and source
  order passed. Initial loading/time-limit failures are documented in evidence.
- Full local check/full E2E suite omitted under this package's explicit
  memory-limited delivery override. CI is the final gate.

The shared read-model change is limited to the Portfolio performance holding flag.
No dependency, migration, automatic booking or real provider access.

## Visual evidence

Desktop 1440px and phone 390px captures and verification details:
[Portfolio package evidence](https://github.com/Grabman1987/budget/blob/codex/pkg-d-portfolio-1009/docs/evidence/portfolio-package-d-1009/README.md).
Affected regions: Portfolio overview, report 4.2 legend/source tables, report 4.4
benchmark/class tables and report 4.5 summary. These specs have evidence captures,
not committed Portfolio pixel baselines; none were regenerated. CI/Linux visuals
and physical iPhone acceptance remain open.

## Owner steps

Review wording, classification links, collapsed lists and the comparison captures.
No keys, consents, migration or account/provider setup is required. Wait for required
CI and independent review before integration. This task does not merge or deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
