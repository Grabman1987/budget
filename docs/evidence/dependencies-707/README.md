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
Fresh mobile browser scans additionally identified the avatar summary: its visible
initials were absent from its explicit profile-menu name. That name now includes
both initials and owner name, preserving the visible label for voice navigation.
That initial native run passed10cases, failed4Axe cases (mobile Chromium and
WebKit, each light/dark) and had3existing desktop-only profile skips. All four
failures identified the same avatar summary; desktop Axe, real Freedom capture/
Undo and the three search-focus cases passed. It is not a passing whole run.

Scoped test adaptations:

- `sidebar.test.tsx` verifies complete visible profile/auth-method names, a named
  synthetic owner and the collapsed icon's name instead of an overriding label.
- `search-launch.test.tsx` selects the full desktop name; existing navigation,
  keyboard, result and focus assertions remain.
- `global-search.spec.ts` selects the exact desktop or mobile trigger name in its
  existing URL/history/month/scroll/focus preservation case; assertions unchanged.
- `freedom.spec.ts` updates only the desktop profile-link selector to its full
  name. Every financial, mutation, cache and Undo assertion remains unchanged.
- `mobile-chrome.test.tsx` additionally verifies the literal visible initials and
  complete menu name; no existing assertion is replaced.

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

Final-lock `npm ci --engine-strict` and build passed. The seven-suite final-lock
run had92passes/one initial header-loading timeout while typed lint was also
running; the unchanged isolated header suite then passed7/7. After the mobile
avatar correction, its two affected component suites passed8/8. These counts
overlap. Scoped ESLint passed for the initial change; CRLF normalization fixed a
local package.json formatter warning without changing its canonical Git content.

Independent full source/lock/test review is CLEAR at `caa7f4f0`, including all48
new/relocated registry records and manifest/lock consistency. The scoped Linux
shell run40249619850 passed44tests with9configured profile skips in53.1seconds,
without baseline changes. Its images establish unchanged visual rendering, not
the subsequently discovered mobile avatar accessibility fix.

Independent mobile-fix review is CLEAR at `fef3fff6`; scoped ESLint for that
component and its test also passed. The final scoped Linux strict Axe run
40250485932 passed all45cases in1.8minutes, including desktop, mobile Chromium
and WebKit light/dark scans, without weakening any rule or adding skips.
The actual test summary was checked because the snapshot workflow itself permits
test failures. No screenshot baseline change was produced.

`npm audit --omit=dev` reports zero known production-dependency findings; the
four moderate development-tool findings above remain. Required full CI,
integration and publication are pending; this is not a live-delivery claim.
