# Reduced-motion theme inheritance — #481 / #595

The minimal fix passed a fresh E2E build and actual pinned WebKit 27.2 proof at `422d624958cdd59f090ea45951e6ac271a021ea7`, based on main `f3aafd78`. The only product change sets the existing universal reduced-motion `transition-duration` from `0.01ms` to `0s`, retaining its `!important`. Animation duration/count, scrolling, colors and semantic roles are unchanged. The unsuccessful app-root color declaration is absent.

## Reproduced cause

On unchanged main `e74c4ef5` (tree `917bf8df`), two fresh WebKit contexts used the same real theme button and synthetic local Plan55 fixture. With `no-preference`, normal and semantic dark colors became ready before any screenshot; ordinary text contrast was 10.59–13.41:1. With `reduce`, 3,233 native animations initially ran, including inherited-color CSS transitions; 55 remained after the bounded five-second readiness check. Relevant inherited-color transitions remained pending at current time zero with a `0.01ms` duration, and ordinary text contrast stayed 1.18–1.49:1. The existing universal positive duration had unintentionally enabled the default `transition-property: all` on otherwise unanimated descendants. No transition-end consumers were found. The control returned exit 1 (three setup passes, normal-motion pass, reduced-motion failure): a failure reproduction.

A separate unchanged-main observer control failed both with and without explicit pre-capture style reads; that observation was not necessary for the defect. Earlier failed captures and computed observations remain external diagnostic artifacts and do not constitute final visual evidence.

## Verified candidate

The canonical WebKit run exited 0: five passes in 44.8 seconds, consisting of three unchanged setup cases plus the new desktop case (18.1 seconds) and phone case (12.5 seconds). Neither case skipped coverage or changed its default 30-second timeout. The fresh `npm run build:e2e` exited 0. All three frozen source/test/document hashes remained unchanged through the run. Existing CSS-scale and token tests passed 27/27; isolated strict analysis found no diagnostics in the new E2E file, with two pre-existing imported `e2e/sample.ts` option-tuple diagnostics retained. No aggregate check is claimed for this dependency branch.

Both cases use actual product theme controls, including native phone taps, in the dark → light sequence. Before the first viewport capture in each theme they require actual normal ink/background and distinct muted/good/bad roles. After capture they retain exact normal/semantic colors, text fill, opaque-background WCAG contrast ≥4.5, main Axe violations 0, overflow checks and native 44px controls. The desktop context is configured at 1440×900 with `isMobile:false` and `hasTouch:false`; the phone uses the iPhone 13 context at 390×664. Actual viewport measurements, before/after roles, screenshot pixel dimensions and hashes are in [runtime.json](runtime.json).

Ordinary dark text measured 10.59–13.41:1; light text measured 15.45–17.23:1. The author and coordinator opened all four actual viewport images and found no new visual defect in this change. Known pre-existing Plan55 phone cropping is unchanged and is not acceptance of the separate compact-plan feature.

| Context | Dark | Light |
| --- | --- | --- |
| WebKit desktop | [Actual image](desktop-dark.png) | [Actual image](desktop-light.png) |
| WebKit phone | [Actual image](phone-dark.png) | [Actual image](phone-light.png) |

Pending: independent final evidence review; combined #595 validation; required Chromium CI and deployed verification. This dependency does not claim a PR, merge, deployment or issue closure. It leaves #481/#595 acceptance with their complete feature deliveries.
