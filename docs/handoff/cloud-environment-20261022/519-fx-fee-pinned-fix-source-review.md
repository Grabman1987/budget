# #519 recurring FX fee correction: independent pinned source review

Reviewer: root, independent of implementation. Source `d6cb8e1c0555196c5dcdefa01784f621a4a0d521`, base `5e2ab4b4785d1a9f67dd442d96240f369e62ffe4`.

This review pins the previously documented uncommitted correction to the actual committed product delta. The only changed product file is apps/server/src/api/bookings.ts; the other two changed files are documentation.

No actionable finding in this bounded correction. The imported fxLinksOfBooking lookup covers fromBookingId, toBookingId and feeBookingId, without excluding retained deleted relations. repeatFrom rejects a linked booking before createExpectedPayment. Existing ordinary-transfer checks remain. PATCH executes updateBooking and repeatFrom inside the same runInTransaction; a rejection therefore aborts that write before the delivery receipt is inserted. A previously stored idempotent response is returned without a new recurring-payment mutation, as before this change.

Evidence: exact committed diff, changed-path list, relation lookup and PATCH transaction source inspected. No tests, typechecks, builds, database, browser, CI or runtime operations. This closes the recorded recurring-fee P2 only at the named source revision; it does not re-review the full FX implementation, inherited migrations or runtime acceptance. NOT VALIDATED / NOT LIVE.
