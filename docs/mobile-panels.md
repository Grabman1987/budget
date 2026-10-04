# Mobile panels: root cause, contract, acceptance

Scope: the shared overlay primitive in `packages/ui/src/components/panel.tsx` (`SidePanel`,
`BottomSheet`, `DetailPanel`, `FormDialog`, `WideDialog`) and its styles in
`packages/ui/src/styles/components.css`. Opened through `?panel=` (`PanelLink`, `PanelHost`) or by
state in the caller.

## The bug (owner report 04.10.2026, real iPhone Safari)

Tapping "Seitenpanel testen" or the floating "+ Buchung" button darkened the screen (the
backdrop) and showed nothing; closing restored the page. Bookings could not be entered on the
phone.

## Root cause (proven in WebKit)

`.overlay-inner { height: 100% }` sat inside a bottom sheet whose height is `fit-content`
(user-agent style of a modal `<dialog>`; the sheet only sets `inset: auto 0 0 0`). WebKit resolves
a percentage height against a `fit-content` parent as 0: the sheet's content box collapsed to
height 0, so the dialog was a zero-high strip at the bottom edge (measured in WebKit, iPhone 13
viewport 390 x 664: dialog `top = bottom = 664`, `height 0px`, inner box `0px`, while
`dialog[open]`, `display: block`, `transform: none`). Only the `::backdrop` was visible. Chromium
treats that percentage as `auto`, so the same CSS showed a correct sheet there (measured:
top 101, bottom 844 in 390 x 844), which is why the Chromium mobile project never caught it.

Bisect in real WebKit (Playwright WebKit 26.0, iPhone 13 profile), each rule overridden alone:

| Override                                           | Dialog height |
| -------------------------------------------------- | ------------- |
| none (bug)                                         | 0 px          |
| `.overlay-inner { height: auto }`                  | 584 px, fixed |
| `dialog.sheet-bottom { height: auto }`             | 584 px, fixed |
| `.overlay-inner { max-height: none }`              | 0 px          |
| `.sheet-bottom, .panel { transition: none }`       | 0 px          |
| `dialog.overlay { overflow: visible }`             | 0 px          |
| form `max-height: inherit` removed                 | 0 px          |

So the entry animation (`@starting-style`, `overlay`/`display` with `allow-discrete`), the
transform, `dvh`, z-index and overflow were not the cause. (These were the other candidates in
the directive; they are ruled out for this symptom in WebKit 26.0.)

Proven: the collapse, its cause and the fix, in real WebKit. Inferred: that the owner's iOS
version behaves like Playwright's WebKit 26.0 build. The symptom (backdrop without sheet,
reproducible, both for `FormDialog` and `DetailPanel`) matches exactly, and `WideDialog`, whose
dialog has a definite `height: 100dvh`, was not affected (the spec confirms it renders on the old
CSS too).

## Fix (shared primitive)

- `dialog.sheet-bottom` has `height: auto` and a variable cap `--sheet-max: 88dvh`; its inner box
  is auto-high and capped by `--sheet-max` minus the bottom safe area. A sheet never uses a
  percentage height for its content. `.overlay-inner { height: 100% }` stays only for dialogs with
  a definite height (`.panel`, `.is-full`).
- The open position is explicit (`.panel[open], .sheet-bottom[open] { transform: none }`). The
  entry animation is an enhancement; nothing depends on `@starting-style` to bring the sheet into
  view.
- Phone only: `html:has(dialog.overlay[open]) { overflow: hidden }`, and
  `overscroll-behavior: contain` on the dialog and its scrollers, so the page behind does not
  scroll or take over a swipe at the end of the sheet. Desktop keeps its scrollbar (no shift).
- Focus return: Safari does not focus a tapped button or link, so the native dialog had nothing to
  return the focus to. The primitive remembers the control of the last tap (max. 2 s old) and
  focuses it after the dialog closed, unless the focus went to another control.

## Regression coverage

- `/dev/panels` (`apps/web/src/routes/panels-harness.tsx`, only in `vite dev` and the e2e build):
  harness for `DetailPanel` (short and long content), `FormDialog` and `WideDialog`, with a
  scrollable page. Independent of any page; stays when "Seitenpanel testen" is removed.
- `e2e/mobile-panels.spec.ts` runs in the `webkit-iphone` project (real WebKit, iPhone 13) and in
  `mobile` (Chromium 390 x 844). Scenarios: the "+ Buchung" button (`FormDialog`),
  `?panel=beispiel` (`DetailPanel`), the Posteingang icon (`WideDialog`, full screen) and the
  three harness dialogs. Verified: on the old CSS the sheet scenarios fail in WebKit and pass in
  Chromium; on the new CSS everything passes in both.
- CI installs the WebKit browser (`.github/workflows/ci.yml`, `update-snapshots.yml`).

| Test | Directive item |
| ---- | -------------- |
| `M01-M03, M10-M12` (light and dark) | M01 panel visible, not only the backdrop (height, content hit test); M02 inside the visual viewport, anchored to the bottom, at most 88 %; M03 close control visible, on screen, hit by a tap; M10 no horizontal overflow; M11 axe serious/critical 0; M12 light and dark |
| `M06, M07` | reopen works; three open/close rounds leave no open modal, no displayed dialog, no invisible scrim (a tap on the tab bar place hits the bar) |
| `M03 ... returns the focus to its trigger` | focus in, focus back (harness) |
| `M05` | Back closes, Forward reopens, close button steps back |
| `M04` | a tap on the backdrop closes a sheet, a tap inside does not |
| `M08` | long content scrolls inside the sheet; page is locked; position kept after closing (wheel only in Chromium, see limits) |
| `M09` | CSS contract for the safe area (see limits) |
| Esc, reduced motion, landscape, flow | Esc closes; layout without the entry animation; 750 x 340 and 844 x 340; Reports > profile > Settings > Anlageklassen > sheet > close > reopen > Back > forward |

## Real-device checklist (owner confirms, directive section 45)

Automated = covered by `e2e/mobile-panels.spec.ts` in WebKit iPhone and Chromium mobile.
Owner = needs the real iPhone (Safari and, if used, the home-screen app).

| Item | Automated | Owner |
| ---- | --------- | ----- |
| Settings opens | flow test | confirm |
| Anlageklassen opens, no placeholder | page exists in flow test; placeholder removal is PR4 | confirm after PR4 |
| Class detail visible | sheet visible (WebKit) | confirm |
| Backdrop and sheet both visible | yes (M01, M02) | confirm (the actual bug) |
| Close works | yes (M03, M04) | confirm |
| Scroll does not lose the sheet | yes (M08, as far as emulation reaches) | confirm swipe, incl. rubber band at the end |
| Back closes the sheet | yes (M05) | confirm (also the edge-swipe gesture) |
| Back from the page | flow test | confirm |
| Reopen | yes (M06) | confirm |
| No frozen backdrop | yes (M07) | confirm |
| Bottom navigation | existing shell specs | confirm |
| Profile menu | flow test | confirm |
| Settings index | flow test | confirm |
| Light and dark | yes (M12) | confirm |
| Rotation | landscape sizes | confirm real rotation with the sheet open |
| "+ Buchung" opens the capture sheet, a booking can be saved | yes (M01, existing capture specs) | confirm (critical) |
| Safe area (home indicator) | CSS contract only | confirm the footer buttons clear the indicator |
| Safari toolbar collapse while the sheet is open | no | confirm |

## Known limits

- Playwright WebKit is the WebKit engine, not Safari: it has no real toolbar collapse, no
  home-indicator inset (`env(safe-area-inset-*)` is 0), no touch swipe and no mouse wheel in the
  mobile profile. Those items stay on the owner checklist.
- `viewport-fit=cover` is not set in `apps/web/index.html`, so Safari reports 0 for the insets in
  the browser. The `env()` paddings are in place for the case it is set later (PWA standalone).
- Playwright's WebKit build has no `overscroll-behavior`; Safari 16+ does. The page lock
  (`overflow: hidden` on `html`) is the part that holds in both.
