This package explains why the debt total and repayment strategy candidates can differ, connects the model to the existing financing check, and puts the calculation sections at full width.

- Refs #294: explain negative net account values versus negative native-currency cash. A synthetic positive-net depot with negative cash remains a strategy candidate without being silently added to the net debt total.
- Refs #296: link the overview and repayment model to the existing liquidity forecast; state its budget-account scope and that no model amount is transferred, booked, confirmed affordable or actually configured.
- Refs #342: stack the calculation lead and model at full content width. Numeric comparison columns remain intact.
- Refs #343: audited first; the baseline/scenario summary already follows the model at full width. No remaining layout change was needed in loan-planning.css.

No calculations, schema, dependencies, API/write routes, audit or undo behavior change. No shared code outside the Portfolio/Vermögen lane changes. No new detail route is introduced; the selected loan remains in the existing kredit query.

Validation: web TypeScript, changed-file ESLint/Prettier, 70 tests in four affected API/domain files, and the single E2E build passed. The two affected browser specs passed 7/7 on desktop 1440 and 7/7 on mobile 390 (including setup), with light/dark Axe, overflow, numeric-column geometry, direct URL/browser Back, cancellation/focus-preservation and audit/undo/redo checks. [Evidence and known limitations](https://github.com/Grabman1987/budget/blob/codex/pkg-c-debts-1009/docs/evidence/debts-scope-1009/README.md).

Screenshots: [desktop light](https://github.com/Grabman1987/budget/blob/codex/pkg-c-debts-1009/docs/evidence/debts-scope-1009/desktop-light.png), [desktop dark](https://github.com/Grabman1987/budget/blob/codex/pkg-c-debts-1009/docs/evidence/debts-scope-1009/desktop-dark.png), [phone light](https://github.com/Grabman1987/budget/blob/codex/pkg-c-debts-1009/docs/evidence/debts-scope-1009/mobile-light.png), [phone dark](https://github.com/Grabman1987/budget/blob/codex/pkg-c-debts-1009/docs/evidence/debts-scope-1009/mobile-dark.png). The package delivery override skips the full local check and full E2E suite; CI is the final gate.

No visual baseline was regenerated locally. The existing debts.spec.ts prototype reference captures remain; its superseded desktop side-column assertion now checks full width/stacking. Added context affects debt overview/terms and loan-planning captures. There are no committed debt pixel baselines to regenerate.

Known existing limitation: cancelling a loan dialog immediately unmounts it, so focus does not return to its trigger. This package preserves that behavior and compares focus under both layouts; trigger restoration is a separate gap.

Owner steps: review the synthetic desktop/mobile captures, the existing focus limitation, and required CI. No migration, keys, provider consents or external setup are needed. Do not merge until required checks and owner acceptance pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
