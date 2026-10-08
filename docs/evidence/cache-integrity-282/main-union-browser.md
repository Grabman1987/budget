# Main-union browser evidence

On the integration branch based on `origin/perf/part2-1007` at `16a4bd8a203a807d713f956d3d10ff5fd0f8ecdb` plus `origin/main` `61aa041cf9ff8ec7adeb0d335ca3ae791504ec1d`, `npm run build:e2e` passed. Focused `e2e/inbox.spec.ts` and `e2e/whole-picture.spec.ts` passed on desktop and mobile: 18 passed, one desktop-only backdrop test skipped, exit 0.

The inbox flow uses the isolated synthetic API database and checks axe serious/critical findings; the four images below are the original Playwright full-page captures in light and dark themes. The long-queue case also passed, drawing 100 then 130 rows and retaining the group count, but it supplies a mocked 130-row response. It does not prove server-side or network pagination. The fresh-cache rerun records workspace, current source locations, and before/after SHA-256 `7D2743595CD3D21716AD0CC71287D87D430E1BD5F3A9DCCC036D7E6427BB1647`; the dedicated transform map's embedded `sourcesContent` hash exactly matches that source. The reporter prints transformed-code line positions (for example, generated line 216), while the source test is line 157. No source instrumentation or restore was used. Logs: `budget-cache-integrity-282-main-union-browser-1008.log` and `budget-cache-integrity-282-main-union-browser-fresh-cache-1008.log`.

- Desktop light: [inbox-desktop-light.png](inbox-desktop-light.png)
- Desktop dark: [inbox-desktop-dark.png](inbox-desktop-dark.png)
- Mobile light: [inbox-mobile-light.png](inbox-mobile-light.png)
- Mobile dark: [inbox-mobile-dark.png](inbox-mobile-dark.png)
