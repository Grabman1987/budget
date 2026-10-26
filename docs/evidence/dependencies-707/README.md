# Existing dependency PR707 continuation

Original head `67316fba` is retained. Main `7b77a574` was merged at `9427d330`;
the two manifest/lock conflicts retain current jsdom30, Hono and web Vite8 as
well as the original dependency updates. No financial source, migration,
authentication policy or verification gate changes.

The previous CI run39945588582 failed Axe4.14's visible-label/name rule for the
shared desktop search and sidebar profile link. Their explicit short names
overrode longer visible text. Expanded controls now derive their names from
their text; icon-only mobile search and collapsed profile retain explicit names.
A separating space preserves the profile's two text parts in the accessible
name independently of stylesheet loading. Visible text and destinations stay the
same; no Axe rule is disabled.

Scoped test adaptations:

- `sidebar.test.tsx` verifies complete visible profile/auth-method names, a named
  synthetic owner and the collapsed icon's name instead of an overriding label.
- `search-launch.test.tsx` selects the full desktop name; existing navigation,
  keyboard, result and focus assertions remain.
- `global-search.spec.ts` selects the exact desktop or mobile trigger name in its
  existing URL/history/month/scroll/focus preservation case; assertions unchanged.
- `freedom.spec.ts` updates only the desktop profile-link selector to its full
  name. Every financial, mutation, cache and Undo assertion remains unchanged.

The focused accessible-name regressions first failed five cases. After correcting
the names and DOM text separator, five affected suites passed70/70. These initial
runs used the original merged lock's test Vite7, not the final dependency graph.

An npm audit then identified a second, transitive Vite7.3.6 with a high advisory.
`npm update vite --package-lock-only --ignore-scripts` uses the existing allowed
ranges to share Vite8.3.5 with the app, removing the unused Vite7/Rollup graph.
LightningCSS moves with Vite and PostCSS shares the already used8.5.31. The removed
Linux LZMA optional package belonged to removed Rollup. No override was introduced.
The refreshed audit reports four moderate findings in the existing DrizzleKit/
esbuild development chain, no high finding; no breaking forced audit fix was run.

Final-lock install/checks, browser acceptance, independent final review, required
CI and publication remain pending. This document does not claim current live
delivery or a clean audit with zero findings.
