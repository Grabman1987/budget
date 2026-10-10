Payslip history and details now open as a report subpage; manual capture/edit and PDF upload use form dialogs. Income/expense cells link to their existing source splits and filtered booking view, retaining the selected period and row/column context. Secondary future, category, spending and overview sections use full width.

- Refs #335: payslip history/details URL, breadcrumbs and back navigation.
- Refs #336: existing capture/edit/upload paths in form dialogs, preserving validation/audit/undo.
- Refs #337: report-cell source links with period, selected cell and expanded-group context; bounded return link from the existing booking view.
- Refs #344: full-width liquidity secondary sections.
- Refs #345: remove the remaining empty category-summary grid column on the #411 base.
- Refs #347: spending content followed by secondary summary/sources.
- Refs #348: overview content followed by secondary summary/sources.

Stacked on the open PR #411 branch to isolate this package. Retarget main after #411 merges, before merging this PR. Keep this package as one PR. No formulas, migrations, dependencies or booking-editor changes. Shared changes are limited to router registration/scroll restoration and the booking view's report-only return link.

Validation: web TypeScript, changed-file ESLint/Prettier, CSS scale, 49 focused unit tests and one E2E build passed. All six functional desktop scenarios passed across focused reruns; the final mobile run passed 9 tests (3 setup + 6 functional). Browser results and screenshots: [evidence](docs/evidence/report-panels-1009/README.md). Full local check/full E2E intentionally omitted under the package's machine-memory override; CI is the final gate.

Visual baselines: no local regeneration. Affected report specs produce review images; review payslip, income/expense, liquidity, category, spending and finance-check images on Linux. Existing shell report-catalog baselines are unaffected.

Owner steps: review desktop/phone navigation, form cancellation/focus, full-width order and Linux visuals after required CI. No keys or consents are needed. Do not merge before #411 and the required checks.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
