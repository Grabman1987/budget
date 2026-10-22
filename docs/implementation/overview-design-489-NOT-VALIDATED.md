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
- The initial checkpoint kept client DEV/e2e-only route exclusion. The server refused
  `/dev` and decoded `/dev/*` paths with 404/no-store when the existing NODE_ENV
  production mode is active, before static serving and SPA fallback. This supplies
  a server boundary rather than relying on client hiding. Local dev/e2e behavior
  stayed under its existing development mode; authenticated APIs were unchanged.
- Follow-up D-37 source delta: production bundles only the `/dev/bauteile` route
  from the dev pages. `BUDGET_BAUTEILE_ENABLED=1` is the sole operator-controlled
  production switch and defaults off. With the flag on, the canonical GET/HEAD
  path requires the existing owner session before static/SPA delivery. A separate
  `/api/dev/bauteile-access` probe is mounted only when enabled, after the same
  `/api` session and no-store guards, so client navigation also checks the server.
  All other `/dev` paths and noncanonical/encoded gallery aliases stay 404; the
  Vite production build still has sourcemaps disabled. Developer-only gallery
  links are hidden in production. Missing AuthGate with a requested production
  enablement fails at start. No role model, step-up, API write or financial-data
  path was added. The flag was not activated.
- The [independent production-boundary source review](overview-design-489-production-flag-source-review.md)
  at `8a534c8de543ba2e8c72a264c3c8dec2a357577d` found two bounded P2 cases.
  A corrective source delta now reapplies `no-store` after downstream SPA/static
  delivery of the canonical authenticated gallery (including HEAD/error responses),
  and rejects unresolved percent escapes after the bounded decode pass with
  404/no-store. This keeps deeply encoded aliases out of SPA fallback. The flag,
  owner-session requirement and refusal of other developer paths are unchanged.
  The [independent exact-delta review](overview-design-489-production-flag-fix-source-review.md)
  is source-clear at `0154ab19c9cf10030acc67283cfa41c91a0397df` against
  `8a534c8de543ba2e8c72a264c3c8dec2a357577d` for both P2 cases. No HTTP case
  was run; the source checkpoint remains NOT VALIDATED / NOT LIVE.
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
the exact production gallery allowlist and session guard before static/SPA fallback,
plus the separate `/api` probe under its established session/origin/CSP guards.

## Remaining acceptance and limits

Confirmed revision provenance is not available, so dated REV metadata remains
explicitly unavailable. Source implementation does not prove 390px overflow,
contrast, desktop/mobile/WebKit geometry, keyboard/screen-reader behavior or Axe.
Production flag-off/flag-on, unauthorized/authorized, encoded-path and other
`/dev` 404, cache headers, SPA navigation and static fallback behavior need
meaningful later HTTP/browser checks; no such requests or builds were run. Source of any
actual browser eval/CSP violation remains to investigate under the strict policy.
The bounded production-boundary source reviews are archived. Exact-head required
checks and authorized delivery/live evidence remain open. No issue is closed or
represented as accepted/live.
