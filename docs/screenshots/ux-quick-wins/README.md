# UX quick wins: review evidence

These images show only the repository's synthetic sample ledger in Chromium on
Windows: desktop 1440 × 900 and phone 390 × 844. They are review evidence, not Linux
Playwright baselines.

| View | Desktop | Phone |
| --- | --- | --- |
| Today attention strip | [Image](heute-desktop.png) | [Image](heute-mobile.png) |
| Monthly unclassified row | [Image](plan-desktop.png) | [Image](plan-mobile.png) |

The relevant browser run completed 72 successful cases and one existing intentional
mobile skip across privacy, storage protection, attention, capture links, capture,
Today, Plan and PWA. Windows test-server teardown required manual cleanup. Its
synthetic seed was compiled with the existing esbuild dependency because the local
tsx loader fails in `os.userInfo` (`uv_os_get_passwd`, ENOMEM).

The full unit run passed 2,074 cases, skipped two and failed the four existing import
worker tests at that same tsx/Windows loader failure. Typecheck, lint and the e2e
build and production build passed; all 14 focused feature unit tests also passed.
Green CI and Linux visual baselines remain required before merging.
Use the existing **Update e2e snapshots** workflow on `feat/ux-quick-wins`, then rerun
CI; this task does not change the workflows or repository settings.

Owner acceptance remains open: inspect these flows on the actual desktop and phone,
check the device's privacy preference and storage status, and configure any desired
capture shortcut as described in [capture links](../../capture-links.md).
