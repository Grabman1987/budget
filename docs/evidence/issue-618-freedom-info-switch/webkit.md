# Issue 618 on webkit-iphone

- Date: 2026-10-17, Playwright 1.64.1, Windows 11 (8 GB RAM, memory-starved during the run).
- Selection: `npx playwright test --list --project=webkit-iphone` lists 4 tests of `e2e/issue-618-freedom-info-switch.spec.ts` (141 tests in 32 files in total).
- Command: `npx playwright test e2e/issue-618-freedom-info-switch.spec.ts --project=webkit-iphone --workers=1`
- Default timeouts (30 s per test, 5 s per expect): 3 passed of 7 (the 3 setup tests), the 4 Freiheit tests timed out. Cause is the machine, not the page: a single `keyboard.press` took 0.4-3 s on `/vermoegen/nettovermoegen` as well as on `/vermoegen/freiheit`, and the API answered the cold Freiheit page later than 5 s with free RAM at about 30 MB and 100 % CPU.
- Same command with an untracked local config that only raised `timeout` to 240 s and `expect.timeout` to 60 s (no spec, assertion, rule or source change): 7 passed of 7 (setup 3, Freiheit 4: keyboard/ⓘ, switch/table vs. chart tooltip, light and dark Axe + 44 px targets).
- The repository config keeps its tolerances. The authoritative run is the Linux CI shard that carries these tests.
