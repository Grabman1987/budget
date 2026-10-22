# Heute section snapshots and contact reminders — source assembly

**NOT VALIDATED.** This is an isolated source checkpoint for #574, #558 and #599 under the owner's 2026-10-22 implementation-only direction. No tests or test edits, static checks, typechecks, builds, browser runs, CI, migrations, pull request, merge or deployment were performed. Source inspection is the only evidence here; issue acceptance remains open.

## Exact lineage and bounded assembly

- Branch: `codex/impl-574-offline-contact-assembly`, based on Heute commit `d27f9a2ff042d3c565009040c701ce37141efe98`. Its common feature base is `6420676d257698767931dd151863765cec914acf`.
- Offline source: runtime commit `a8502ed35d454324f7d67049536f1680aa3ffb82` and patch checkpoint `f24d665fd69019f5b563977390f76fcef5d0ae4a`. Only the offline runtime files changed since the common base were carried. The two preserved patches in `docs/handoff/offline-574/` at that checkpoint supplied the scoped section adapter and the two-line capture mount. The original patch files remain at their source revision; their hunks are present here.
- Contact source: `5bac17b31026aae54e1063d4de607949c51abc1a`. Its contact page/CSS and contact DB repository changes were carried against files unchanged on the Heute base. The contact reminder DTO, masked contact task row, and task model were already inherited from the Heute commit; they were retained. The DB connection hunk came from `docs/handoff/cloud-environment-20261022/574-contact-599-integration.patch` at `64df6a1fce4c9638bf46307e01da4d7b2fc9398e`.
- Shared files were integrated by their scoped hunks. The Heute page retained the newer independent section queries and gained only the offline capture mount. The DB Heute reader retained its section factories and added the canonical contact reminder result to the tasks section and legacy response. The existing server section routes, session guard, HTTP error boundary and `no-store` policy were inspected and unchanged.

The offline runtime checkpoint has a coupled raw receipt queue (#559/#699/#700) in its HTTP, security and PWA entrypoints. Those consolidated source files are carried intact so the #558 snapshot path has complete imports and logout fencing; this assembly adds no new receipt behavior beyond that existing checkpoint. No dependencies were installed or replaced.

## Source behavior and limits

- Authorized successful section GETs are saved under the protected `today` view with their own source URL, receipt time and exact returned server `stand`. A native read/merge/write transaction retains independently successful sections across tabs and refuses a stale response for the same section. Epoch, generation, logout and storage fences remain in the write path. The local viewer marks every missing section and shows each saved section's timestamp, server day, month and returned period independently. It does not fabricate a complete aggregate or a common current timestamp.
- A legacy complete Heute copy remains readable until a section success replaces it. A failed or unrequested section keeps its earlier saved value or stays visibly missing. Pinned and accuracy may have no copy. Other protected offline views keep their existing separate paths.
- The section tasks endpoint now supplies contact reminders from the existing dated contact statement replay. The contact page's manual allocation preview and settlement still use the canonical domain allocation and existing audited/Undo writer. The local contact label applies the same money-text masking helper as the online task row. Unsupported-currency reminders remain explicitly unavailable.
- The server section route still uses the existing shared session guard, read cache, per-section error response and `Cache-Control: no-store`. No schema, financial formula, booking writer, lock, audit or Undo code changed here.

## Remaining acceptance

Independent full-diff review is needed for the finance/security scope. Exact-head verification must cover section success/failure and selection changes, native IndexedDB concurrent merge and logout erasure, cold offline capture, raw receipt queue behavior inherited with the offline runtime, contact FIFO/manual persisted allocations and grouped Undo, day-30/day-31 reminders, unsupported currency, privacy, device layouts/accessibility and ordinary required checks. Historical evidence on source branches does not validate this assembled head. No issue is closed.
