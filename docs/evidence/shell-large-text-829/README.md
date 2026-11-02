# Shared phone chrome at enlarged text

Refs #829. Bounded prerequisite repair prepared on main `012c31d6` in branch
`codex/829-large-text-20261102`. Actual execution: shared Cloud session, Codex
Sol implementer; local budget-impeccable and budget-verified-delivery profiles.
No hosted task, production release, activation or real data. Production redesign
remains OFF.

At 320 CSS pixels and twice the computed text-token sizes, the old title-block
period group measured 305px from x29 (right334); “Bis Gehalt” extended to346.5.
Fixed tab cells were64px but their label text widths were88/66/106/151/117px.
The last label extended to373px. The existing mobile accessibility rule uses the
body font for these controls:16px normally and32px in this probe. Those sizes
are preserved.

The ON mobile title block now allows its value and period controls to shrink
and wrap; their hit areas remain at least44px. Fixed tabs retain all five labels,
order and destinations, wrapping their text within equal columns. Their shared
height remains64px normally and grows to144px at200%, plus the existing safe-area
inset. The sheet's bottom padding and FAB position consume that same height.
A viewport width cap and viewport-relative FAB anchoring keep fixed controls
within the configured horizontal screen bounds even if an independently owned page overflows.
No page content is hidden or clipped by this repair.

Only two CSS files and the existing S3 browser proof change. Styles are scoped
through the trusted ON marker and the existing phone breakpoint. No generator,
font size, token, application behavior, source ordering, month semantics, financial
calculation, API, auth, workflow, dependency or screenshot baseline changes.

## Verification

The added ON phone probe visits the actual current September page, captures
computed token sizes once, tests normal and200% in light/dark, then restores the
exact original root style/theme and prior URL. It checks DOM Range line bounds
inside each individual control against configured/client width (never expanded
mobile innerWidth),44px targets, focus, actual Tab traversal, Axe and the final
main control above the revealed FAB after scrolling to the end. Original S3
assertions and timeouts remain intact. Theme and enlarged-size mutation is
confined to this browser probe.

- Focused actual app: Chromium and WebKit at320/390, normal/enlarged, both themes.
- Full existing `scripts/dev/redesign-smoke.ts`: exit0,36 PASS stages, retained
  actual1440/390 OFF→ON→OFF installed-PWA lifecycle,320 OFF/ON shell, T2/T3/T6,
  and both-engine galleries. [Stage output](smoke-stages.txt).
- [Geometry](geometry.json) records the actual shared-proof results; CSS and
  proof hashes are pinned in [source-hashes.json](source-hashes.json).
- Targeted ESLint, CSS-scale guard, Prettier and diff checks passed. The actual
  configured pre-push gate is recorded separately by the final candidate commit.

The first smoke invocation stopped before any browser assertion because the
explicit current OFF e2e artifact was absent. Building the existing `build:e2e`
prerequisite resolved that local preparation issue; the subsequent complete
smoke passed. No assertion, timeout or host requirement in source/CI changed.

Browser versions: Playwright1.64.1, Chromium1248 and WebKit2370. Chromium uses
the provisioned workspace cache; WebKit uses the previously verified isolated
818 cache whose launcher bundle includes its required libraries. The per-process
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypasses only ldconfig's inability
to see those bundled libraries; actual WebKit launch and assertions passed.
No local Impeccable engine was available, so review used the project adapter
and actual browser evidence. Browser emulation is not physical-device or native
browser-zoom acceptance;200% here means doubled computed font tokens.

## Evidence limit and handoff

This proves the shared period controls and fixed phone chrome. Existing Heute
summary content still has enlarged-text overlap/overflow, visible in these
synthetic screenshots; it belongs to the independently owned H1 repair. The
August other-month note and full-page200%/320 regression remain mandatory after
composition. No full-page reflow or owner/device acceptance is claimed here.
The current-month route preserves the actual canonical month/period controls
without adopting or suppressing H1 content failures.

These checks do not prove vertical containment within the configured844px
viewport. In the committed enlarged Chromium results, inherited page overflow
expands the mobile layout viewport: the tab bar bottom is953px at320 and877px
at390. The probe proves configured horizontal bounds and relative FAB/tab/final-
control clearance. Full viewport and page-reflow acceptance remain deferred to
the composed H1 verification.

[Normal Chromium320](chromium-320-light-1x.png) ·
[Enlarged Chromium320](chromium-320-light-2x.png) ·
[Enlarged WebKit320 dark](webkit-320-dark-2x.png) ·
[Enlarged WebKit390 dark](webkit-390-dark-2x.png)

Independent final-diff review, exact-head CI and root-only serial integration
remain required. No production release is authorized by this package.
