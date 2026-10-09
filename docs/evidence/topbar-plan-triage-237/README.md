# Top-bar overspending link and Plan triage (#237)

This evidence records the final synthetic UI/API behavior at source head `e5b8d7ff9dfa8e53e7b763c498ff33019731dfa6`. The Linux full check and visual preflight are recorded below; exact PR-head CI, live verification, and private-ledger acceptance remain open.

## Current link and query behavior

The top-bar overspending chip is a direct link to the current month's Plan triage (`/plan/monat` with the current `monat` and `ansicht=triage` search values). It does not open a popover or content sheet and does not write data. Cover and undo remain actions on the Plan page.

While the budget query has no data, the chip makes no numeric or zero claim. If the query errors—including a failed refetch when cached data exists—the chip instead shows the neutral “Budgetstatus nicht verfügbar – Plan prüfen” Plan link. It does not present the cached amount as current. Counts remain visible when the cent total is unsafe, while the amount changes to “Betrag unbekannt”. Amount privacy masks sums in both visible and accessible text; the link's accessible name identifies the status and destination.

## Synthetic regression and verification

An isolated ledger begins with 8,000 cents available in one envelope and a 5,000-cent overspend in another. Covering produces 3,000 cents available and zero overspend; undo restores 8,000 and −5,000. Real API writes, coverage, and undo are exercised on desktop and mobile. The screenshots capture the top bar and covered Plan triage in both themes.

- Unit: two files, eight tests, 10.34 seconds, including a failed-refetch-with-cache case; RED was observed before the final GREEN run.
- An earlier broader browser run had 13 passes and two failures because the new assertion expected “1 Envelope” while the existing Plan UI says “1 Envelopes”. The assertion was corrected to the rendered label.
- Final E2E build: web build 13.98 seconds and server build 2.135 seconds; the build command exited 0.
- Final browser run: five passed in 52.5 seconds (three setup cases plus desktop/mobile cover-and-undo scenarios).

The run is focused evidence, not a general UI acceptance. Captures include keyboard focus/skip-link and the scroll-dependent fixed shell. Physical Safari and private-data acceptance were not performed.

## Linux preflight

The read-only Linux preflight completed successfully in GitHub Actions run [37879767925](https://github.com/Grabman1987/budget/actions/runs/37879767925). It validated source `e5b8d7ff9dfa8e53e7b763c498ff33019731dfa6` through workflow-only helper commit `2c0878e2ced9b1caba6c0bff49a99f10a6d49867`; the task checkout is `6c0fa72120aa9064a82efaa1a9e41871e0eae847`. The helper proved the source tree unchanged and did not update screenshot baselines.

- Focused unit gate: three files, nine tests, 5.45 seconds.
- Full repository check: 383 files and 3,526 tests in 246.35 seconds; typecheck, lint, and format passed.
- Production and E2E builds passed.
- Desktop/mobile behavior run: 15 passed in 51.7 seconds, including setup cases.
- Linux visual comparison: 23 passed in 1.1 minutes, including three setup cases and 20 test cases; the inventory covered 26 screenshot assertions. No baselines were updated.

The eight Linux top-bar and covered-triage screenshots below come from successful Linux run [37880079988](https://github.com/Grabman1987/budget/actions/runs/37880079988), which ran the #237 E2E regression as part of the nine-case #265 browser suite. That run used source `ca6791486c9d1cae5c081be43bb7d85969d27298`; compared with `e5b8d7ff9dfa8e53e7b763c498ff33019731dfa6`, its changes are #265 tests and evidence only, with application implementation unchanged. The original eight Windows captures below are retained. These results provide focused evidence for issue #237; exact PR-head CI, integration/live proof, physical Safari and private-data acceptance remain open.

## Captures

| Screen         | Desktop light                           | Desktop dark                           | Mobile light                           | Mobile dark                           |
| -------------- | --------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------- |
| Top bar        | [PNG](topbar-desktop-light.png)         | [PNG](topbar-desktop-dark.png)         | [PNG](topbar-mobile-light.png)         | [PNG](topbar-mobile-dark.png)         |
| Covered triage | [PNG](triage-covered-desktop-light.png) | [PNG](triage-covered-desktop-dark.png) | [PNG](triage-covered-mobile-light.png) | [PNG](triage-covered-mobile-dark.png) |

SHA-256:

```text
32E895C8BDF3FE48E0B2ED48324E8001DC0D6060B597C4948FDEBB771DE140C5  topbar-desktop-light.png
E8E19DDB78901CCAE319D6854972CAF74ABF200D3E6CDC27B9325BBA10F1E3A5  topbar-desktop-dark.png
C29EA42E8AB4D6B4D74F232AC4DF690154F4F74162E4FA9DAD372E998368651D  topbar-mobile-dark.png
CEB07E7E699BC3F07060549848F3EB178FD56F077FAA9AB7F9EBAE23FDE55CB5  topbar-mobile-light.png
A4874143C3AFDAA88A03D713237C38F36C0BECFF4CC60805767A1B0CC8E242B1  triage-covered-desktop-light.png
DFFB4ED76647432A215FCDFC478D5BBE493CB527EE3BC1E57420CBCC7AAE534E  triage-covered-desktop-dark.png
D68DBD780BA6302472DA5C3754C40778FA68F5CEFAB65A623F78D4195F5E9AEE  triage-covered-mobile-light.png
EF3D6E48D5D9F5144744D04F32FBE41BE8B549E2C13C03473A51B848553A083F  triage-covered-mobile-dark.png
```

Linux captures from run 37880079988:

| Screen | Desktop light | Desktop dark | Mobile light | Mobile dark |
| --- | --- | --- | --- | --- |
| Top bar | [PNG](linux-37880079988/topbar-desktop-light.png) | [PNG](linux-37880079988/topbar-desktop-dark.png) | [PNG](linux-37880079988/topbar-mobile-light.png) | [PNG](linux-37880079988/topbar-mobile-dark.png) |
| Covered triage | [PNG](linux-37880079988/triage-covered-desktop-light.png) | [PNG](linux-37880079988/triage-covered-desktop-dark.png) | [PNG](linux-37880079988/triage-covered-mobile-light.png) | [PNG](linux-37880079988/triage-covered-mobile-dark.png) |

SHA-256:

```text
99621B3E1A1E907753FB387C03E1BD3160F78355672EBE7A1C42266A25486D47  linux-37880079988/topbar-desktop-light.png
CBA235FBC5B731AED11E44048BF498703CDC56E32363D21BECA180D920FDAD1B  linux-37880079988/topbar-desktop-dark.png
B6C5A6F7CC0560CEAD0DECF664B345043C85DEF5CFA6CD68062A7699E93CC602  linux-37880079988/topbar-mobile-light.png
1FB9FD1D21CC809D77C939E7AF62B14EC1FCDCCCCC6E701992FE73393E8BEFF8  linux-37880079988/topbar-mobile-dark.png
0345448B9ADD897EAED6B530651A432E82DF388BBD9081F167FE9545BC3DB410  linux-37880079988/triage-covered-desktop-light.png
B99524F8A29611D23111C88D39136D81F3E5ACCFD9739820BA94A303E7D5B0DB  linux-37880079988/triage-covered-desktop-dark.png
CC9155B11C2CB5734C88F2B8DDDF27FF9982F528B9C2C471E1C5EB9354E52A13  linux-37880079988/triage-covered-mobile-light.png
3FB8EA4DF41A4D3361E1E88FC6471134B14D1ED6805EAD94DACEDE5D5A1FA87A  linux-37880079988/triage-covered-mobile-dark.png
```
