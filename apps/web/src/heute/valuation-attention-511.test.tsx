// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import { HeuteWealthLine } from './heute-page';
import type { ValuationSource } from '../ledger/valuation-hint';
import { AttentionBar } from './attention-bar';
vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);
const data = (count: number): Parameters<typeof AttentionBar>[0]['data'] => ({
  stand: {
    today: '2026-09-20',
    month: '2026-08',
    period: 'month',
    from: '2026-08-01',
    to: '2026-09-02',
    payday: { day: '2026-09-30', source: 'payday_rule', daysToPayday: 10 },
    budgetBalanceCents: 0,
  },
  nextSteps: { items: [], count: 0 },
  financeCheck: {
    actionRules: [],
    counts: { ok: 0, warn: 0, bad: 0, total: 0, notEvaluated: 0 },
    keyRules: [],
  },
  accountReminders: [],
  attention: {
    inboxCount: 0,
    pendingCount: 0,
    pendingBefore: '2026-09-13',
    loanTermsMissing: false,
    quoteReview: { count, securityIds: Array.from({ length: count }, (_, i) => `held-${i}`) },
  },
});
it('shows exactly one current source row for distinct securities and preserves a real instruments destination', () => {
  const { container } = render(<AttentionBar data={data(3)} />);
  expect(screen.getByText('3 Wertpapiere ohne aktuellen Kurs')).toBeTruthy();
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Kurse prüfen' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Kurse prüfen' }).getAttribute('href')).toBe(
    '/vermoegen/portfolio',
  );
  expect(screen.getByText('Stand heute · 20.09.2026')).toBeTruthy();
});
it('has no quote row for fresh quotes, usable executions or FX-only gaps supplied as zero by the shared read model', () => {
  render(<AttentionBar data={data(0)} />);
  expect(screen.queryByRole('link', { name: 'Kurse prüfen' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Zu tun' })).toBeNull();
});
it('uses singular copy without adding per-security duplicate actions', () => {
  render(<AttentionBar data={data(1)} />);
  expect(screen.getByText('1 Wertpapier ohne aktuellen Kurs')).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it.each(['quote', 'cost'] as const)(
  'marks the visible12-month figure for current%s data outside the collapsed month detail',
  (kind) => {
    const source: ValuationSource = {
      accountId: 'depot',
      securityId: 'held',
      name: 'Synthetic held',
      asOf: '2026-09-20',
      kind,
      quality: kind === 'cost' ? 'estimated' : 'stale',
      date: kind === 'cost' ? null : '2026-09-12',
      currency: 'EUR',
      source: null,
      lookAhead: false,
      positiveHolding: true,
      quoteNeeded: true,
      missing: null,
      fx: { kind: 'identity', date: null, source: null },
    };
    const { container } = render(
      <HeuteWealthLine
        data={{
          ...data(0),
          valuationSources: [source],
          netWorth: {
            liquidCents: 0,
            assetsCents: 11400,
            liabilitiesCents: 0,
            monthChange: { deltaCents: 1400, investmentsInCents: 0, marketCents: 1400 },
            investedCents: 11400,
            receivableCents: 0,
            debtCents: 0,
            totalCents: 11400,
            asOf: '2026-09-20',
            previousMonthEndCents: 10000,
            yearAgoCents: 10000,
            yearAgoDay: '2025-09-20',
            yearDeltaCents: 1400,
            deltaCents: 1400,
            deltaBp: 1400,
            series: [
              { day: '2025-09-20', cents: 10000 },
              { day: '2026-09-20', cents: 11400 },
            ],
          },
        }}
      />,
    );
    const marker = screen.getByRole('button', {
      name: 'Bewertungsgrundlage · Verlauf Nettovermögen · aktueller Stand',
    });
    expect(container.querySelector('.heute-wealth-line')?.contains(marker)).toBe(true);
    expect(marker.closest('#heute-more-content')).toBeNull();
    expect(screen.getByRole('link', { name: '+14,00 € seit 20.09. vor 12 Monaten' })).toBeTruthy();
    const detail = document.getElementById(marker.getAttribute('aria-describedby')!);
    expect(detail?.textContent).toContain(
      kind === 'cost' ? 'Einstandswert als Schätzung' : 'Kurs vom 12.09.2026 fortgeschrieben',
    );
  },
);
