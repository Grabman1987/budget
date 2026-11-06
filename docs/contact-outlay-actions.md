# Contact outlay actions

Owner continuation, 2026-11-05. Local implementation scope; publication and owner acceptance remain separate.

Outlay checkboxes belong to the actual receipt form. Selecting one proposes its remaining amount and updates the receipt total. Selection alone writes nothing. The existing allocation validator still requires allocating the actual receipt up to the dated open balance. For example, paying a selected EUR 20 outlay can leave another EUR 10 outlay open. A EUR 35 receipt must cover both before its EUR 5 excess can become credit or budget money. Paid/open is derived from the ledger and saved allocations, never an independent flag. The receipt keeps its explicit account, actual date and amount. Future outlays are excluded by that date and future receipts remain forbidden.

`POST /contacts/:id/settlements` accepts optional `excessToBudget`. Existing callers retain their contact-credit behavior when the field is absent or false. The current form initially selects budget conversion. When requested, only this receipt's excess (`settleContact.creditCents`) is converted through the existing `writeOffContact` path, using the same date, account, transaction and audit group. Older contact credit is not swept. A budget destination must satisfy the existing open EUR budget-account guard. A historical receipt whose excess has already been consumed by later outlays is refused atomically; no partial receipt, hidden reduction or future-outlay activation occurs. The response retains the receipt allocation result and adds the optional `budgetConversion` result. Its `creditCents` remains the receipt's recorded allocation fact, not a replacement for the current contact statement.

`POST /contacts/:id/outlays/:splitId/gift` accepts an explicit positive integer `amountCents` and an existing own expense `categoryId`. The selected outlay must currently be open and the amount cannot exceed its remainder. Its source booking is reclassified through ordinary `updateBooking`, preserving its date, bank amount and other shares. A partial conversion keeps the remaining contact share and appends the own expense share. The UI displays the unchanged original date and requires the user to choose their gift category. No new category, expense, receipt or cash movement is invented.

All existing reconciled, allocation, receipt, transfer and audited Undo guards remain. A booking with any native contact allocation cannot be economically edited, even if the paid portion would be retained. The first version therefore blocks that conversion and points to the source/related receipt Undo workflow. It does not substitute aggregate FIFO forgiveness for a selected-item action. Transfer-linked sources also remain in the ordinary source editor. No migration or new paid-state storage is introduced.

Regression scope:

- `apps/server/src/api/contact-item-workflow.test.ts`: real API/SQLite checks for the new compound receipt/RTA transaction and grouped Undo, retained legacy credit, future dates, rollback, selected gift target, partial source preservation and allocation refusal. These add acceptance cases without weakening existing contact tests.
- `apps/web/src/contacts/contact-item-workflow.test.tsx`: real form interaction checks selection/deselection and the produced actual-receipt payload. Existing contact source/readiness tests remain relevant.
- `apps/web/src/contacts/contact-editor-source-620.test.tsx`: migrate the preview label to the new budget default while retaining every cached-money, draft and refresh assertion.
- `e2e/contacts.spec.ts`: explicitly deselect budget conversion in its existing excess-credit branch. All saved-credit, amount, allocation, Undo and retained-history expectations stay unchanged.

Validation status is recorded in the handoff, not inferred from this contract.
