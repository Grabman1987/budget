# Synthetic statement-settlement evidence

These four PNGs are unedited originals from one fresh-build canonical WebKit run.
Seven cases passed on the first attempt (four statement scenarios plus three setup
cases), with no skips, retries or flaky results; reported native duration was
57.9 seconds. Source was the reviewed init-corrected checkpoint. This is native
feature evidence, not an integrated full-suite, normal production-build, CI or
LIVE result.

| Original | Actual CSS viewport / DPR / pointer | Physical PNG | Scenario |
| --- | --- | --- | --- |
| [Desktop light](desktop-light.png) | 1440×900 / 1 / fine | 1440×1027 | Issued EUR 100.00; newer EUR 30.00 retained |
| [Desktop dark](desktop-dark.png) | 1440×900 / 1 / fine | 1440×1027 | EUR 1.25 expense credit; payable EUR 78.75 |
| [Phone light](phone-light.png) | 390×844 / 3 / coarse | 1170×3753 | EUR 1.25 expense credit; payable EUR 78.75 |
| [Phone dark](phone-dark.png) | 390×844 / 3 / coarse | 1170×3966 | Issued EUR 100.00; newer EUR 30.00 retained |

The synthetic cases use real account/document APIs and database state. They
configure the funding account, accept the issued statement without booking,
create its exact transfer and, in the bonus scenes, separately accept/create the
expense refund. Original booking values and revisions remain unchanged; newer
purchases are checked in the two settlement-only scenes. Persistent action
buttons actually undo both independent groups, in opposite orders across the two
bonus scenes, with explicit reload and exact balances asserted.

Visible controls were measured at least 44px. Configuration, create actions,
persistent Undo and the toast Undo target have strict viewport, text containment
and centre-hit checks. The toast Undo button is measured, not activated; actual
Undo uses the persistent named actions. Axe reports no violations at the captured
post-creation state, not every intermediate form/error state.

Privacy checks hide the printed payable and change the initially EMPTY bonus
input to password type without altering its value. They do not prove masking of
a populated bonus draft, all document facts, PDFs or every application screen.
Date `fill`, Enter/click, selections and scrolling are automation evidence. Both
contexts use WebKit; raw maximum touch points were zero. Neither a physical
phone/keyboard nor a mobile OS was tested.

These are full-page captures, not viewport crops. Desktop image height 1027
exceeds viewport 900; phone physical heights 3753/3966 exceed the 390×844 CSS
viewport at DPR3. The dialog is internally scrolled with background captured
below it: upper source/configuration sections and parts of the form are off-frame.
The toast overlaps body prose. The strict action geometry above passed; the
images do not establish unobstructed reading of the whole form at once.

Current UI 15/15, source-original eligibility rejection/positive controls,
migration-copy/backup and projection checks are separate focused checkpoints.
They are not summed with the native batch. Net-only/difference reconciliation and
the represented-source reassessment editor remain OPEN; backend acknowledged
reassessment preserves the same credit/history. #727 remains a partial delivery.
