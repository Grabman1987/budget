# UX-3c: phone chart and table containers

Scope: Reports and Portfolio at 390 px, synthetic data only. No financial calculations, dependencies, migrations or provider access.

- Liquidity tables stay in their local, keyboard-focusable scroll regions. The first column remains visible and phone copy explains horizontal scrolling. The report grid becomes one column on phones.
- Geldfluss below 600 px uses a simplified vertical legend: inflows, available pool, class uses, with amounts and shares. Groups remain in the source table. Existing chart inspection supplies keyboard and touch values; class hatching is retained.
- Liquidity ticks keep at least 60 px between centres for all three horizons; daily source points and inspection stay intact.
- Portfolio allocation places the existing chart-inspection wrapper across the whole phone row, so the track retains its 16 px height and full row width.
- Report headers use the full width above the existing phone controls; the report month remains on one line. Header CSS is restricted to Reports containers; shared shell components are unchanged.
- Plan > Jahr already has a stacked phone layout. Regression coverage includes it and the Reports Jahresansicht comparison column (Veränderung).

## Verification

- Red: four new component tests failed on the original tick density and missing phone legend. The original phone browser run also reproduced the truncated liquidity title and hidden allocation track.
- Focused units: 2 files / 11 tests passed, including amount-privacy masking in the phone chart alternative.
- Production build and E2E build passed. The final browser run used the production bundle: 22 passed / 9 intentional desktop skips of phone-only checks, one worker, 120 s server-start limit. A previous server-start attempt failed before tests with `uv_os_get_passwd` / `ENOMEM`.
- Full `npm run check` was run once with `VITEST_MAX_WORKERS=2`: exit 0, all workspace typechecks and lint/format checks passed, 351 files / 3,250 tests passed (806 s unit phase). Typecheck, ESLint and Prettier for the final privacy addition passed separately.
- Phone screenshots in both themes were inspected; no baseline files were written.
- New phone E2E checks cover document scroll width on all four requested routes, both themes and Axe, local table scrolling/sticky columns, readable headings/ticks and full-width bars. Existing Geldfluss/inspection checks cover the new phone variant.

## Visual review and owner steps

No screenshot baselines were regenerated locally. Review existing `e2e/components.spec.ts-snapshots/bauteile-{light,dark}-{desktop,mobile}-linux.png`: a narrow Sankey spike can now show the phone legend. Review fresh light/dark phone evidence for Liquiditätsprognose, Geldfluss, Plan > Jahr and Portfolio, plus the Jahresansicht table and existing Geldfluss report evidence. No other stored screenshot baseline is intentionally changed.

CI and owner inspection on an actual phone remain required. No keys, consents or application configuration are needed. No merge or deployment is part of this task.
