Booking capture now keeps keyboard focus inside the dialog and sends focus to
the discard question. Continuing restores the prior control; Escape/discard
returns to the opener. Both gaps were reproduced by the new focused E2E scenario
before the small BookingPanel/CSS correction.

Refs #309 — focused acceptance covers German date, arithmetic, payee/account/category
defaults, exact-cent persistence, visible Save, height and 390px touch/scroll behavior.
Refs #314 — dark Heute and booking-dialog review with axe, representative token
contrast ratios, textual chart status and viewport screenshots; no contrast defect
found in this synthetic review. Heute source is unchanged.
Refs #315 — explicit labelled-control focus order, Tab/Shift+Tab boundaries,
discard/continue/opener focus, pressed status words and reduced-motion checks.

Validation: web tsc, changed-file ESLint/Prettier and 46 affected unit tests pass;
E2E build passes. Targeted Chromium desktop/mobile each pass 6 tests including
3 setup cases. Full local check/full E2E were not run under the package's explicit
parallel-machine constraint; unchanged required CI is the final gate.
An additional standalone E2E TypeScript probe reports existing fixture typing in
e2e/sample.ts; the shared helper and workspace configuration are unchanged.

Evidence and screenshots: docs/evidence/booking-acceptance-1009/README.md.
All data is synthetic. No dependencies, migration or visual baseline regeneration.
Affected versioned baselines: none; shared component baselines and Heute source
remain unchanged. This package changes only BookingPanel, its scoped CSS and the
new acceptance spec, plus evidence and the roadmap.

Publication limitation: this runner could not create the worktree index.lock or
authenticate a push/PR. Current evidence records baseline SHA
6f603966779ed370dae4e8ac5290d3a942dfa670 plus the dirty worktree and source hashes;
it does not claim exact-head CI acceptance. After committing, rerun the focused
spec at the clean final head and record that SHA and required CI results here.

Owner steps: restore normal Git metadata/GitHub access, commit and push this single
package, run required check/check-windows/docker/restore-test at its exact head,
review the screenshots and try the capture/discard path on a physical phone with
the owner's screen reader. No keys or consents are required. Do not merge as part
of this package.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
