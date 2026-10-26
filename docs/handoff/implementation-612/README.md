# #612 local Sondertilgung scenario

The selected loan's #611 plan/history read pair remains the source of the current balance,
currency, dated rates and canonical API baseline. Monthly and one-off extras are parsed to integer
cents and applied only with `simulateLoan`; the result, scenario chart line and annual table use
the same returned schedule. No scenario save, booking or audit endpoint is called. The existing
saved scenario editor remains under Rechenweg.

The original V16 frame `206:9364` resolves the otherwise ambiguous example to 4,200 EUR
principal, 200 EUR monthly installment, 4% nominal APR, zero fees, first payment October 2026,
and 500 EUR one-off in November 2026. The independent BigInt cents oracle in private
`612-oracle-notes.mjs` gives baseline July 2028 / 22 payments / 161.57 EUR interest and scenario
May 2028 / 20 payments / 128.94 EUR interest. Savings are 32.63 EUR and two months. The repo
test uses these literal expected values; it does not derive its expectations from app output.

An edited draft survives a pending or failed replacement read, while all financial output is
hidden. An identical successful basis restores the draft. A changed loan/history read pair stays
hidden until the user explicitly adopts it, which resets the local fields. Invalid amounts or a
missing one-off month leave the baseline intact and show no scenario comparison. The chart
preserves the #611 actual-history gaps, native currency, exact tooltip values and privacy masking.

## Test file reasons

- `debt-plan-history.test.ts`: adds the literal V16 oracle and input-boundary cases; existing
  account/history consistency assertions retain their meanings.
- `debt-plan-chart.test.tsx`: proves a distinct scenario line and inspection values; existing
  actual-gap and privacy assertions are unchanged.
- `debt-plan-history-refresh.test.tsx`: adds the edited-draft pending/error/adoption regression and
  verifies a monthly extra uses the matching USD loan/plan basis and changes its payoff; the
  previous failed-refetch assertion remains unchanged. jsdom is used for stateful controls.
- `e2e/issue-612-debt-live.spec.ts`: creates only a synthetic loan, checks the visible V16 result,
  monthly response, no API writes, reload reset, 1440/390/WebKit light/dark Axe and overflow,
  touch sizes and privacy. Browser execution and screenshot inspection remain for CI.

Local focused checks on Node 22.23.3: web TypeScript, three focused Vitest files, scoped ESLint,
Prettier, CSS scale and `git diff --check` passed. Browser/build and required full CI are deferred
to the queue gate so the concurrent #777 CI remains the only heavy test job. A capable independent
full-diff financial/UI review is required before integration.
