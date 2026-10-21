# #573/#603 canonical reader extraction — SOURCE CLEAR

Bound to frozen2 manifest `eec083060d03f6a2664c025a26b1628a244ad816548671bc44742401ba1174cf` at base759464, reviewed2026-10-21. Both physical files match frozen SHA/modes. Retained prior-route.ts equals committed759464 API bytes.

Independently compared the complete `export function readMonthClose` wrapper plus `readMonthCloseWithin` to the new DB helper: byte-identical, including transaction, work/source revision, account ordering, result/nextPlan and deviations. Complete `monthCloseRoutes` declaration through EOF is byte-identical. Extraction moves only implementations/imports and preserves API re-export for prior direct consumers.

Direct imports resolve to the same existing DB exports: schema values via../schema, Db via../client, and individual repo modules. No @budget/db self-import, HTTP/API import, or return-edge to month-close-read exists in its direct repo dependencies. Existing transaction callback argument/type usage is unchanged. Root's separately added repos/index.ts export is now present and reachable through root src/index.ts; API readMonthClose import/re-export is source-coherent. No formula, scope, writer or route guard change in frozen2.

No tests/types/lint/runtime executed. This is a narrow mechanical extraction review, not whole #573/#603 revision/cache/batch/UI acceptance; later changed source requires separate review.
