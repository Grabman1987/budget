# Month navigation and payday

Owner request, 2026-10-02; supersedes the prototype's month-end payday example.

- Heute exposes `Bis Gehalt` only in the current month. Other months keep the
  control visible and disabled, explain why, select `Monat`, and normalize the
  URL to `period=month`. Reloading or returning to today retains that choice.
- The planning payday is the 15th, or the preceding Austrian business day. The
  existing `shiftToBusinessDay` helper supplies weekends and Austrian public
  holidays. The current payday stays included; the following day advances to
  next month's payday. No payment schedule or transaction is rewritten.
- The salary marker and cash forecast still use stored expected payments. A
  stored salary date that differs from the planning payday remains visible on
  its actual date; the rule never creates an imaginary income.
- `Decken` remains available in past, current and future months. In a desktop
  multi-month plan, each overspent cell opens the envelope for that cell's month,
  including its available funding sources and existing audited cover/undo API.

Calendar source: [OeNB Austrian bank holidays](https://www.oenb.at/Service/Bankfeiertage.html).
Good Friday is a TARGET closing day but is not an Austrian bank holiday, so this
rule retains the existing Austrian calendar. The additional 24 December bank
holiday cannot affect a payday that moves backward from the 15th.

Coverage: literal payday dates in `packages/domain/src/heute/heute.test.ts`,
literal cover request bodies in the budget UI tests, updated independent sample
read-model expectations, and desktop/mobile behavior in `e2e/month-nav.spec.ts`.
Visual baselines are unchanged; owner device acceptance remains separate.
