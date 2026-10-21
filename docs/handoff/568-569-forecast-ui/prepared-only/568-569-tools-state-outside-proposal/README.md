# #568/#569 — retain the user’s tools disclosure state

Outside-only one-file source correction against frozen5a6f6bcd. LiquidityReportPage owns useState(false); real details open/onToggle is controlled by that state. Same-page lever/horizon queries may still unmount the report while loading/error, but the owning page state survives and restores the user’s last open/closed choice. Fresh mount or document reload starts closed. No persistence, query placeholder/stale data, forecast writer/formula or hidden-control manipulation is introduced. Existing source returns only query.isSuccess data unchanged; never show cached numbers for a new unavailable horizon.

Exact inverse restores the frozen source. Existing eight-file snapshot is untouched. NEW real Router coverage will independently prove refetch behavior; no runtime has been executed. Dependent OLD relocation adapter is separate and still needs specific owner permission.
