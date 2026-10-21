# #554 — six-file group booking drilldown: SOURCE HIGH CLEAR

Independent read-only review of complete current changes versus HEAD plus unchanged relevant request/classifier/pagination callers. Exact source pins:

- `packages/db/src/repos/ledger-queries.ts`: `0c5c8274d5758018c1b2c4f6058ffd0f00f92a7c7b319c4c1bb6af254e60d825`
- `apps/server/src/api/schemas.ts`: `5877f2ba270afb1788e026a1a033ea95be2daeddd10033453ce25e190ff9d745`
- `apps/web/src/ledger/types.ts`: `674bd136e0197701132011599ccfedae6ac4897e9a6a7d8442a45ef4ed292606`
- `apps/web/src/ledger/bookings-search.ts`: `afbdb72ac324878e357ed088ec5151e7202c690e5ad4178c81aee69310811218`
- `apps/web/src/ledger/bookings-page.tsx`: `0d8ad80dc223b0a2d78b51dace83e4effcff838fe8ca942205af37cdcf17dfef`
- `apps/web/src/ledger/api.ts`: `c0b48acba5aa46d837683b772c625dd51bcd2e26377852bb07f6f1fa7c7a7849`

## Verified source seams

- German URL `kategoriegruppe` is validated/bounded, becomes `BookingFilter.categoryGroupId` and forces the classified `category-spending` basis. It participates in active-filter chips, reset, query identity and the existing filtered-selection clearing. The chip names actual lookup group and explicitly Bedarf/Wunsch; net summary labels Gruppe rather than Kategorie.
- The sixth file `ledger/api.ts` now explicitly includes categoryGroupId in filterParams. The existing generic fetchBookings request carries it to GET /api/bookings; API bookingQuery accepts the same bounded ID and bookings.ts spreads the defined validated property into queryBookings. No route, auth policy, HTTP write or mutation API added.
- Group member IDs come from reportTables' current live classified categories, with future excluded. Contributions come from the SAME reportTables(withSources:true) split classifier as the report; refunds retain signed category contributions, including payee-targeted refunds. Nonspending, internal transfers, irrelevant cash/system/contact flows and unrelated/future-category split amounts do not enter group contribution sums.
- The selected category AND selected group predicates both apply when both are supplied: this is an intersection, including a selected category outside the group producing no matches. Unknown group gives an empty Set and therefore no contribution IDs/results, never unfiltered fallback. No raw group value interpolated into SQL.
- A Map accumulates matching split cents once per booking; SQL selects unique bookings by membership. Mixed-category cash bookings retain their original whole booking/splits, while existing item.categorySpendingCents and page.categorySpendingCents carry just the classified group contribution. A zero-net matching booking may remain visible; this does not add its unrelated cash amount to the report total.
- Inclusive from/to and existing account/payee/status/flag/text predicates apply to the same candidate booking set. The full-match contribution summary is calculated before cursor filtering; pagination remains existing stable sort+ID cursor with limit cap. Row dates equal source split booking dates, so the same selected report range filters the same contributions. Future set-aside sources are excluded by the group need/want membership; facts are already bounded to today by reportTables.
- No amount, date, account, stored category, split, writer, lock, audit, CAS, allocation or Undo behavior changes. Unfiltered and existing single-category paths retain their prior semantics. Existing Number-based contribution accumulation is reused, not replaced or newly certified for extreme intermediate-overflow behavior.

This clears the six-file source path, not the in-progress report UI/caller links or whole #554 acceptance. Later deferred validation should establish same-period/group literal sums including refund-only categories, a mixed multi-split booking, empty/unknown/intersecting scopes and more-than-one-page totals; preserve all original financial assertions. No tests/new tests, runtime, build, formatter, source edit or remote mutation by reviewer. Owner's implementation-first validation deferral remains respected.
