# Overview drawing details — source checkpoint, NOT VALIDATED

Refs #489. Base: `d50abbc00c99a59ae5f0c8336832eb52680f7c42`, the specified icon
source checkpoint, not a delivery claim. Owner implementation-only direction
(2026-10-22) applies: no tests, new tests/test edits, checks, typechecks, builds,
browser validation, CI, PR, merge or deployment was performed. No real data used.

## Implemented source scope

- `TitleBlock` adds an optional drawing identity with sheet/name and explicit
  revision provenance. Exact overview routes opt in through `AreaHead`: Heute,
  Plan Monat, Konten, the wealth overview registers and Reports hub. Register
  worklists, review queues, settings, report details and deeper routes do not opt in.
- Metadata is a wrapping row that remains visible on phone even where the existing
  title cell is hidden. Existing title/field semantics and financial Stand cells
  remain. No revision is invented from the browser date: absent confirmed drawing
  revision shows an em dash with an accessible explanation. No financial data date
  is relabelled as a software/drawing revision.
- Token-based hairline grid on the metadata and two decorative corner marks add
  the bounded drawing layer. Metadata numerals retain Archivo/tabular figures;
  technical labels retain the existing label style. Existing plot `Graticule`
  components are reused and not replaced by a page-wide background grid.
- Account overview groups with more than five rows show decorative position
  numbers in their existing displayed order. Numbers disappear during reorder;
  no sort, account identity, balance, selection or write changes. Existing PartsList
  and report-catalog positions already provide numbering elsewhere; no global
  numbering is forced onto worklists.
- The synthetic `/dev/bauteile` gallery adds current-theme contrast ratios for
  existing token pairs and the established semantic icons at 16/20/24 px with
  prescribed strokes. Browser-computed ratios are labelled as a local inspection,
  not a completed accessibility audit. Unavailable color resolution stays unknown.
  The existing chart gallery remains, including line/grid/zero-axis primitives.
  The gallery's fixed synthetic date is explicitly labelled Musterdatum.
- Existing client DEV/e2e-only route exclusion remains. The server now refuses
  `/dev` and decoded `/dev/*` paths with 404/no-store when the existing NODE_ENV
  production mode is active, before static serving and SPA fallback. This supplies
  a server boundary rather than relying on client hiding. No production admin
  switch or alternative authentication bypass was invented. Local dev/e2e behavior
  stays under its existing development mode; authenticated APIs are unchanged.
- CSP is unchanged. No console-message filters, eval relaxation or test harness
  changes were introduced. The historical eval-source allegation remains unproven.

## Later integration seams

Preserve the optional `drawing` prop and matching metadata/body CSS when integrating
future shared TitleBlock work. `AreaHead` has independent report/status/settings
changes on other packages; retain the exact-path overview map and drawing prop
without replacing their other source hunks. This avoids touching individual Heute
or Plan page implementations. Reports hub must keep using the shared AreaHead to
receive its identity; new overview routes need deliberate opt-in, never broad area
matching. Account-overview ownership must retain its small decorative position
prop/span while preserving all newer ledger behavior. Server app changes must keep
the production refusal before static/SPA fallback and keep session/origin/CSP guards.

## Remaining acceptance and limits

Confirmed revision provenance is not available, so dated REV metadata remains
explicitly unavailable. Source implementation does not prove 390px overflow,
contrast, desktop/mobile/WebKit geometry, keyboard/screen-reader behavior or Axe.
Production 404/encoded-path/static-fallback behavior and development-only bundling
need meaningful later checks; no such requests or builds were run. Source of any
actual browser eval/CSP violation remains to investigate under the strict policy.
Independent review, exact-head required checks and authorized delivery/live evidence
remain open. No issue is closed or represented as accepted/live.
