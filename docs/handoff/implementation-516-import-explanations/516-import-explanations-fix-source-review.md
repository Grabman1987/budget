# #516 explanation correction — independent exact-delta source review

Reviewed `e7f2b743ffba61be845f5ae7b9ca2defe7ea3f76` against `eef0bec42421abb73f05b2dd8c336431ba584a18` on `codex/impl-516-import-explanations`. Scope: only `apps/web/src/inbox/bank-source-explanation.tsx` and `apps/web/src/inbox/inbox-page.tsx`, compared with the two findings in `516-import-explanations-source-review.md`. The reviewer wrote the original review, not the #516 product delta or this correction. Source inspection only; no tests, checks, build, browser, runtime, provider/private-data operation, CI or repository edit.

**Both original presentation findings are closed at source level. No new actionable finding in this bounded correction delta.**

- The generic `kind === 'import'` detail mount and `OperatorImportExplanation` component are removed. Bank candidate rows still use their source-specific `BankCandidate`/`BankSourceExplanation` paths. A provider candidate can no longer receive the unsupported YNAB file-import identity or reversal text merely because its inbox kind is `import`.
- The read-only explanation now renders its cached `data` subtree only when the GET is settled successfully (`!isFetching && !isError`). On a stale-cache refetch or refetch error, the prior IDs, candidate counts, rules and “Aktuelle Revision” claims are hidden while the existing loading/error/retry states remain visible. The mismatch button invalidates the inbox projection and then explicitly refetches the open explanation, so it does not keep presenting its own old read after the parent updates.
- The exact diff changes no database repository, API route, domain matcher, financial write, confirmation CAS, import workflow, schema or source-revision semantics. The handoff's unresolved equivalent-match policy remains an owner decision; this review neither settles it nor treats the current matcher as newly accepted.

The result is scoped source reasoning only. UI/React Query behavior, privacy, synthetic edge cases, browser/accessibility and delivery remain **NOT VALIDATED / NOT LIVE**.
