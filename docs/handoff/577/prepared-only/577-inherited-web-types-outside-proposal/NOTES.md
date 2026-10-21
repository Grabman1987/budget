# Inherited web types — outside proposal only

All3 before files exactly581b79b6, current221e607c server-only change disjoint. No repository mutation or runtime.

- Plan: existing search reducer input gets `Record<string, unknown>`. The existing search keys remain spread verbatim; exact original ansicht/filter/q values remain. Unknown, not any or a cast.
- Explorer: extract identical raw common options before queryOptions. Spreading queryOptions output carries its DataTag/one-element key; raw options let each call infer its actual existing tuple. Same GET/queryFn/retry; same entry key/enabled/gc/refetch values and invalidation.
- Router: erased `zeitraum?: Period | undefined` matches explicit undefined returned by existing root validator. All five shared redirects/search/params unchanged.

No assertions/casts, any, tsconfig/test/formula changes. Actual type verification remains pending.
