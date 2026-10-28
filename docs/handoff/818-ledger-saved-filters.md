# Named booking filters (#818)

Base: `656b2bbb3bd7c178857c64f82cebd96e6d87ff16`.
Tests-first source: `85f178dfa467b3bc739cb6c8bc6e9e15d156be3e`.
First implementation: `8ba0c48bb0246497eb32605f6f98f56372e26be4`.

## Contract and boundaries

Saved filters use the separate `ledger.bookings.views` app_setting document and
`/api/bookings/saved-views` route, registered before booking-ID handlers. The
existing session/same-origin boundary, transactional audited entity helpers,
revision conflict checks and grouped Undo/redo are reused. Audit insertion order
protects against stale tokens after Undo, including creation Undo. No migration,
table, dependency, financial calculation, booking writer or Explorer change.

The existing permissive URL validator is moved to one pure domain module; its
original validation body and the web filter-to-API mapping are retained. A strict
persistence wrapper rejects unknown, malformed or coerced fields. Only the
specified thirteen filter/sort keys are stored, with literal dates and IDs. Missing
references are not removed from a saved tuple. Name/count limits remain 40/20.

Save/manage buttons live in the existing More menu, with existing native form
primitives. Opening performs a fresh read and replaces the entire URL filter
tuple. Rename retains the old tuple; explicit replace captures the current tuple.
Pending writes block dialog dismissal. Errors/conflicts/lost responses retain the
draft and refresh preferences without automatically overwriting newer data.
Ordinary URL filtering remains independent of the preference read. There is no
localStorage fallback or permanent additional phone toolbar row.

## Tests and actual evidence

Root read actual RED run `40730232275`, proof child `72a9f3ac` from tests `85f178`:
type/build/discovery/original-source/cleanup checks passed. The API failed exactly
on expected 200 versus actual 404. Three actual browser cases reached literal
three-row, −15.57 EUR preconditions and failed on the missing Save action; three
setup cases passed, with zero retries. This is meaningful pre-feature RED.

The new domain tests cover all thirteen keys, strict rejection, the original URL
coercion behavior, all existing flags/sorts and unavailable documents. Seven real
SQLite/API cases cover read/save/fresh read, stable identity, rename/replace,
delete, duplicate names, no-op, twenty-view bound, corrupt/future state, stale
tokens, Undo/redo ABA and transactional audit-failure rollback. Nonempty financial
records remain byte-equivalent through preference CRUD and Undo.

Four browser cases per configured profile cover save/read/reload/full-tuple open,
literal rows/count/sum/CSV IDs, stale-filter replacement, pending/conflict/lost
response drafts, explicit replace/rename/delete/Undo, both-theme Axe, targets and
overflow. Existing parser, filter/refund/FX, bulk/lock/Undo and register density
tests remain unchanged. No overlap was found with the frozen #620 52-path diff.

These implementation tests have not yet run. Proposed first GREEN units are the
new domain/API files plus existing `bookings-search.test.ts` (expected 16 cases
across these three files). Browser discovery should show 12 actual #818 cases
across desktop/mobile/WebKit plus setup; actual discovery is authoritative. Add
existing #594 and #581 regressions for financial filtering and density. Full final
review, formatter proof, exact required CI, persistent synthetic screenshots,
deployment/live verification and issue acceptance remain pending. No local
runtime/formatter, cloud dispatch or push was performed by the author.

Parent #479 density/contact/evidence acceptance remains separate. The existing
ten-row account-register test measures after scrolling the first row into view;
this feature does not reinterpret that as initial-screen parent acceptance or a
physical-device proof.
