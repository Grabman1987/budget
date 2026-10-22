# Payroll upload automation — #741 continuation

Explicit eligible manual uploads use saved salary account/sender configuration and deterministic parsing. Only fully reconciled, uniquely supported results book or link through existing audited atomic payout writers; ambiguous results remain Prüfen. Original-source and persisted booking links, normal Undo and replay guards are retained. Legacy uploads and scheduled scans remain manual. Card delivery and private historical document work are separate.

## Recorded validation

Financial source is unchanged since `e9815933`; later changes supply test context, correct native route interaction and shorten one Undo toast label. Results below retain their actual revisions rather than implying a single final-head run.

| Revision | Evidence | Actual result |
| --- | --- | --- |
| `e9815933` / `8918e674` | Non-browser acceptance and compatibility | 48 new tests passed on `e9815933`. Five existing files / 57 cases passed there; the remaining existing file / six cases passed on `8918e674` after the provider and region-scoped selector corrections. All workspace types passed on `8918e674` (119.03 s). |
| `41f57690` | Native WebKit and static/build | Seven of eight passed: three setup plus four desktop/phone light/dark upload/Undo cases. Final payout-route case failed because its test expected the filtered booking route to open an editor automatically. Scoped lint/format and fresh E2E build passed (8.01 s build). |
| `b0ba1ad2` | Corrected payout-route case | Passed (9.5 s feature; four including setup in 41.61 s). The test now verifies the unique persisted row and explicitly opens its editor before and after reload. New-test lint/format passed. |
| `a138c7b1` | Concise payroll Undo toast | Six component tests passed (4.08 s), source ESLint passed (2.42 s), fresh E2E build passed (9.42 s). Affected WebKit phone light/dark rerun passed: five including three setup (51.51 s runner), without retry or skip. Root inspected both final phone captures: acknowledgment and Undo fit. |

Initial compatibility failures were missing ToastProvider, then ambiguity with its global status region; [the technical adaptations](ADOPTION.md) preserve the existing actions/oracles/timeouts. Visual inspection of the first phone capture found Undo text extending beyond the toast body; `a138c7b1` changes only the acknowledgment to “Gespeichert.”, retaining complete upload-result copy and server provenance. The included desktop capture remains revision `41f57690`; final phone captures replace the earlier overflowing-toast images.

The source packet contains seven production paths and five new test paths. New feature counts are 48 executed non-browser cases plus five native declarations; declaration counts are not browser passes. All fixtures are synthetic. Expected payroll net/splits are literal 297500/287500/10000 cents; native balance expectations are 62345→359845→62345.

[Independent source/delta review and coverage limits](REVIEW.md) and [existing-test adaptation rationale](ADOPTION.md) are retained alongside this report. Required full CI (including Chromium), wider full/production-build checks and serial live verification are pending; this report does not close payroll acceptance.

## Browser artifacts and limits

[Desktop light](payroll-result-desktop-light.png) and [proof](payroll-desktop-light.json) are from `41f57690` (1440×900). [Phone light](payroll-result-phone-light.png), [phone dark](payroll-result-phone-dark.png) and their [light](payroll-phone-light.json)/[dark](payroll-phone-dark.json) proof are from `a138c7b1` (390×664, DPR 3). Root inspected these three captures. These are genuine synthetic WebKit viewport images; the project is `webkit-iphone` even for its explicitly overridden desktop context. Runtime proof records actual properties, including zero reported touch points; no physical phone/OS gesture claim is made.

The four themed upload cases and corrected existing-payout navigation case are established across the recorded runs, not one final full-eight pass. They cover real PDF bytes/download, literal salary/refund splits, persisted association/reload, grouped financial Undo and no repost. Screenshot cases do not click the payout link or prove it initially unobscured; the separate route case exercises normal link navigation, register editing and reload. Hit checks use ordinary assisted scrolling; Axe is scoped to the upload dialog. Live privacy-toggle rendering is not exercised. Raw traces, authentication state, databases and private originals are excluded; private archive work remains separate.
