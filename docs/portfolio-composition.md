# Portfolio composition — owner feedback 2026-10-05

Report 4.2 retains the existing positive classified market-value projection and the signed investment universe for Soll/R13. `compositionGroups` groups those exact class/product cents; standalone classes are their own groups. All levels expose value and classified share. `portfolioShareBp` is the existing whole-universe share, used beside Soll and for deviation. Group Soll sums managed class targets, including classes with no holdings; all unmanaged members yield null. Targets are never inferred from names or security kinds.

Classes with policy value but no chart positions, including unmanaged cash-only classes, remain in their group with zero chart cents/share. Their whole-portfolio share still contributes to group Ist. This preserves both classified-cent conservation and the existing policy denominator.

Migration 0038 is additive: `asset_class.parent_id` is nullable and self-referencing, existing values stay null. `is_group` identifies empty groups and defaults false. Active groups have no parent; only leaf classes can have a group, receive positions or receive targets. Repository writes and audit replay enforce these invariants. Group archive requires its active classes to be moved or archived first. Group membership is current metadata, not historical classification; dated security exposures and targets retain their existing semantics.

Legacy class audit snapshots acquire the missing `is_group: false` only while being read. Stored audit rows remain intact; pre-migration class updates can still be undone and redone. A subsequent group assignment continues to reject stale undo, even with an unchanged timestamp.

The composition card has one larger SVG, inner group inks and lighter class tints, and an adjacent value/share legend. Full segment labels require at least 6% and enough space; smaller or longer names remain available through the shared keyboard/touch tooltip and legend. Tooltip values are exact cents, the segment's whole-portfolio share, within-group share and dated Soll when present. If the signed policy share differs (for example assigned cash outside the chart), the tooltip also shows Ist for the Soll comparison. The source table includes group/class subtotals and products, with whole-portfolio Soll/Ist/deviation. Group cents use exact integer accumulation and reject unsafe final totals.

No region chart remains. The region table appears only when known region cents cover at least 50% of the positive held security value; account positions do not count as securities in that threshold. Otherwise one short notice links to the shared instrument editor. Its Länderanteile field accepts the existing JSON weight format (finite nonnegative fractions, total at most 1), validated with the shared parser at the API boundary. Missing remainder remains unknown; regions are never guessed.

## Operator configuration

`owner-config --file <private-json> --dry-run` accepts:

```json
{
  "assetClassTree": {
    "groups": [{ "name": "Gruppe A", "classes": ["Klasse A", "Klasse B"] }],
    "createClasses": ["Klasse A", "Klasse B"],
    "targets": [
      { "className": "Klasse A", "targetShareBp": 6000, "bandBp": 500, "validFrom": "2026-01-01" },
      { "className": "Klasse B", "targetShareBp": 4000, "bandBp": 200, "validFrom": "2026-01-01" }
    ],
    "accountClasses": [{ "accountName": "Plattform A", "className": "Klasse B" }]
  }
}
```

Names and values above are synthetic. Names must resolve uniquely; only `createClasses` and group declarations explicitly create nodes. Targets replace complete dated versions through the existing target-policy path; each date must sum to exactly 10000 bp, with the signed difference reported on refusal. Bands are custom basis-point bands. Tree creation precedes `createSecurities` and `cryptoMappings`, so new classes can be referenced there. A group and its member moves use a savepoint; unknown members roll back that group. All writes share the run's audit group. Dry-run executes the same writes and rolls back, listing creations, moves, each dated target change and account assignments. A second run writes no new audit entries.

Only when `assetClassTree` is present, unclassified P2P accounts without an explicit mapping receive a same-name leaf class in group P2P. A conflicting existing class/group is reported as skipped; the account remains unassigned. No app read or settings visit creates defaults. Assigned accounts retain existing balance/manual-valuation sources; no booking is created.

## Owner steps

After normal deployment/migration, create groups and move classes in Einstellungen › Anlageklassen; enter complete dated Soll weights via Sollquoten bearbeiten, and assign P2P classes in Einstellungen › Konten. Alternatively prepare a private operator JSON, review its dry-run, then run it on the server and retain the audit group for undo. No real configuration or financial data belongs in this public repository. Enter country weights only where reliable product data exists. Owner visual acceptance and private reconciliation remain separate; this task does not merge or deploy.

The Windows worktree's shared Git index was not writable in this execution environment. Delivery uses isolated ignored Git metadata with the same branch and base. After delivery, synchronize the normal worktree metadata without replacing files:

```sh
git fetch origin codex/alloc-sunburst-1005
git reset --mixed origin/codex/alloc-sunburst-1005
```

## Validation

Synthetic regression tests cover predecessor migration and legacy audit replay, tree depth/lifecycle, complete dated targets, operator dry-run/idempotence/savepoints/P2P defaults, group/API cent conservation, exact signed-cent cancellation and cash-only class policy shares. The last three financial/audit regressions were reproduced as failing tests before their fixes.

Production build passed. Final full local check results are recorded here after completion. The Windows run uses two threads, a transform cache and a temporary three-project configuration: the unchanged hook suite first, export suite next, then every remaining file. This avoids competing with the hook's fixed short subprocess timeouts and the export suite's shared temporary-directory assertions; it removes no tests or assertions. Node heap is capped for this memory-constrained host; a local ignored preload supplies synthetic OS user information only when Windows returns `uv_os_get_passwd ENOMEM`.

Affected Playwright cases: 29 of 30 unique cases (including setup) passed across the final focused runs. New group creation/rename/move, P2P assignment and composition checks passed on desktop, 390 px and WebKit. Report inspection includes keyboard tooltips, Axe, overflow and light/dark/system-dark colours. The existing WebKit U01/M01–M12 panel flow still exceeded its unchanged 90-second timeout, also when run alone; the same flow passed desktop and mobile. This remains an open browser verification item for pinned Linux CI. Screenshot baselines were not regenerated. [Synthetic visual evidence](evidence/portfolio-composition-1005/README.md).
