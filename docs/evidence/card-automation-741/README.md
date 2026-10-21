# Card automation #741 — partial delivery evidence

Synthetic local evidence on `88ee863bedf0eac786b98f78b6eb4999cb337c8a`, with Main 074 contacts inherited. This is the card packet only; payroll and #740 manual receipt selection remain separate. No real documents, accounts or production data were modified.

## Actual validation

- New domain 21, DB 13, real PDF/API 7 and UI 7 passed in the first focused run. After its meaningful later-migration rollback failure was corrected, migration 10/10 and the three added recurring/cross-727 DB cases passed separately. DB coverage is therefore16 distinct passing cases across those runs, not a claimed single combined full run; the selected three-case run reported 13 unselected cases.
- DB/server/Web type checks passed. Owned 24 ESLint passed; owned 23 formatter checks passed, followed by the corrected native file's formatter/lint checks on this head. The initial formatting/native failures remain recorded rather than relabelled successes.
- Fresh E2E build passed. Canonical WebKit passed 7/7 in 57.263 s: three setup and four feature cases, zero retries/flaky/skipped. This is an E2E build, not the pending normal production build/full-check gate.
- Each feature case used a real synthetic PDF worker/upload, pending purchase −7,000 cents and issued transfer −17,000/+17,000 cents. The newer −2,300 cents confirmed purchase remained unchanged. Balances queried explicitly as of 12 January 2031 were 33,000/−2,300 cents (funding/card) after posting and 50,000/−12,300 cents after actual whole Undo. The browser and screenshots are dated 10 January: they correctly show funding 50,000 cents and card −19,300 cents before the printed settlement due on 12 January. Original bookings/audit history and original PDF bytes remained exact. Retrying the undone source did not repost.
- Both phone cases also uploaded an unconfigured synthetic source, retained the explicit review reason, then saved a manual document review. All booking/split/transfer/settlement/bonus rows remained byte-identical; no automatic configuration was created. These later assertions are recorded in the run JSON, not depicted by the earlier screenshots.
- Source/Git, compiled-output-during-native, owned-process and container cleanup guards passed. The original first native failures (HTML attribute vs effective input type) are retained; strict hidden password/value assertions stayed intact.

## Four unchanged originals

| Image | Browser viewport | Full PNG pixels | SHA256 |
| --- | --- | --- | --- |
| [desktop-dark.png](desktop-dark.png) | 1440×900, explicit desktop WebKit | 1440×1027 | `9fd3ff0a9fd95183c863f57104af2d9c02bd961e74f6cfbb0d03609f7d0795be` |
| [desktop-light.png](desktop-light.png) | 1440×900, explicit desktop WebKit | 1440×1027 | `0fa7fa5eabb38d8c1750a72b6221c6570c7e9dac52adf1cfc1f4e0cac8eb150c` |
| [phone-dark.png](phone-dark.png) | 390×664, configured iPhone 13 WebKit | 1170×3966 | `eb1046796647583ef66521da727bc5349936678a05f00058a03ec9e1c53429a1` |
| [phone-light.png](phone-light.png) | 390×664, configured iPhone 13 WebKit | 1170×3966 | `0c2d04dc8c375b957d58bcde460620ef8c306de475369ef198eff05d61a7916f` |

The files are unedited full-page originals captured after showing the automatic result and before Undo. Phone full-page captures include account content below the viewport/modal boundary; they are not screenshots of a taller physical phone. The focused Undo toast overlaps result links on phone. Its 44px height and center-hit ownership passed, but that does not prove the covered links were clickable. The desktop toast overlaps lower form content. Screenshots were visually inspected with these limits, not treated as unconditional layout approval.

Privacy evidence covers conceal/reveal of the editable 170,00 amount; screenshots intentionally show synthetic amounts after reveal. Axe covers only the open statement dialog. Sampled controls have 44px bounds and center-hit checks. Rendered booking URLs/IDs are checked, but clicking through to destination acceptance is still pending. This is browser automation, not physical iPhone/Safari, keyboard or assistive-technology certification.

## Open gates

- Existing regression selection is 77/94 passing: 17 old UI failures across726/727 remain unresolved pending specific approval of the independently reviewed exact transport/eligible-upload adapter. No old test has been changed at this checkpoint; underlying financial assertions are not waived.
- Required AGE-enabled full check, normal production build, exact-head Chromium/required CI, serial integration and verified LIVE are pending.
- Payroll, #740 manual attachment selection and clicked booking-link destination remain outside this completed evidence scope. #741 is not ready to close and no board/production-completion claim is made.
