# Booking inspector evidence (#993)

Synthetic data only. Redesign ON, Windows, Playwright 1.64.1.

| Profile | Light | Dark |
| --- | --- | --- |
| Chromium desktop, 1440 CSS px | [Screenshot](desktop-light.png) | [Screenshot](desktop-dark.png) |
| Chromium mobile, 390 CSS px | [Screenshot](mobile-light.png) | [Screenshot](mobile-dark.png) |
| WebKit iPhone, 390 CSS px | [Trace frame](webkit-iphone-light.jpeg) | [Trace frame](webkit-iphone-dark.jpeg) |

The Chromium images come from passing presentation cases. All six Chromium
presentation/navigation cases passed, including Axe, touch targets, overflow,
Escape/focus return, stored links and unchanged bookings. The shorter iPhone
viewport scrolls within the existing sheet body.

The WebKit images are the final inspector frames extracted from retained failure
traces, **not evidence of a passing WebKit run**. All three Windows WebKit cases
exhausted the unchanged 30-second test budget during browser evaluation/Axe or
navigation. The host was under memory pressure; the precise runtime cause is
unresolved. Earlier traces recorded an opening click taking over ten seconds.
Separating presentation from navigation did not resolve the Windows limitation.
No assertions, timeouts or profiles were disabled or relaxed. Before merge, run
`e2e/issue-993-booking-inspector.spec.ts` on Linux in all configured profiles with
`--workers=1`, and investigate any remaining WebKit failure.

Other completed local checks: full workspace typecheck, changed-file ESLint and
Prettier, CSS scale check, 21 focused Vitest tests, OFF production web build, and
ON e2e web/server build. An independent agent reviewed the final code and test
changes. These images are review evidence, not screenshot baselines or physical
iPhone acceptance.
