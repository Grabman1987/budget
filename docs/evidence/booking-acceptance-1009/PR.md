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

Exact source-commit evidence: desktop/mobile each pass at clean commit
d22965013c108ed3f8abf53a5c6cd3d2123fd445; captures record that SHA, an empty worktree,
viewport, motion preference and accessibility tree. The evidence follow-up is
documentation only and retains application/test hashes. Required CI acceptance
at the final delivery head remains open. Initial Git index/push/PR attempts failed;
normal retries succeeded without an alternative publication path. The branch is
pushed and normal PR #412 is open. Its metadata identifies the final delivery SHA;
the application/test source hashes still match the locally verified source commit.

Owner steps: require check/check-windows/docker/restore-test at PR #412's exact final head,
review the screenshots and try the capture/discard path on a physical phone with
the owner's screen reader. No keys or consents are required. Do not merge as part
of this package.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
