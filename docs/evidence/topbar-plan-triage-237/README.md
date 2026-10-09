# Top-bar overspending link and Plan triage (#237)

This evidence records the final synthetic UI/API behavior at frozen source head `e5b8d7ff9dfa8e53e7b763c498ff33019731dfa6`. It does not claim a full repository check, PR/CI completion, live verification, or private-ledger acceptance.

## Current link and query behavior

The top-bar overspending chip is a direct link to the current month's Plan triage (`/plan/monat` with the current `monat` and `ansicht=triage` search values). It does not open a popover or content sheet and does not write data. Cover and undo remain actions on the Plan page.

While the budget query has no data, the chip makes no numeric or zero claim. If the query errors—including a failed refetch when cached data exists—the chip instead shows the neutral “Budgetstatus nicht verfügbar – Plan prüfen” Plan link. It does not present the cached amount as current. Counts remain visible when the cent total is unsafe, while the amount changes to “Betrag unbekannt”. Amount privacy masks sums in both visible and accessible text; the link's accessible name identifies the status and destination.

## Synthetic regression and verification

An isolated ledger begins with 8,000 cents available in one envelope and a 5,000-cent overspend in another. Covering produces 3,000 cents available and zero overspend; undo restores 8,000 and −5,000. Real API writes, coverage, and undo are exercised on desktop and mobile. The screenshots capture the top bar and covered Plan triage in both themes.

- Unit: two files, eight tests, 10.34 seconds, including a failed-refetch-with-cache case; RED was observed before the final GREEN run.
- An earlier broader browser run had 13 passes and two failures because the new assertion expected “1 Envelope” while the existing Plan UI says “1 Envelopes”. The assertion was corrected to the rendered label.
- Final E2E build: web build 13.98 seconds and server build 2.135 seconds; the build command exited 0.
- Final browser run: five passed in 52.5 seconds (three setup cases plus desktop/mobile cover-and-undo scenarios).

The run is focused evidence, not a general UI acceptance. Captures include keyboard focus/skip-link and the scroll-dependent fixed shell. Full repository checks, pinned Linux visual review, PR/CI and live proof remain open; physical Safari and private-data acceptance were not performed.

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
