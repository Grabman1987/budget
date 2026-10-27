// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import { HeuteWealthLine } from './heute-page';
import type { ValuationSource } from '../ledger/valuation-hint';
import { AttentionBar } from './attention-bar';
import { Kennzahlen } from './kennzahlen';
import type { BudgetMonthView } from '../budget/budget-api';
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
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});
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
    '/vermoegen/portfolio/positionen',
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

const kpiSource: ValuationSource = {
  accountId: 'depot',
  securityId: 'held',
  name: 'Synthetic held',
  asOf: '2026-09-20',
  kind: 'cost',
  quality: 'estimated',
  date: null,
  currency: 'EUR',
  source: null,
  lookAhead: false,
  positiveHolding: true,
  quoteNeeded: true,
  missing: null,
  fx: { kind: 'identity', date: null, source: null },
};
function renderKpi(source: ValuationSource, missingFx = false) {
  const props: Parameters<typeof Kennzahlen>[0]['data'] = {
    stand: data(0).stand,
    valuationSources: [source],
    nearestGoal: null,
    monthResult: { earnedCents: 0, consumptionCents: 0, savedCents: 0 },
    budgetAnswer: { spentCents: 0, plannedCents: 0, remainingCents: 0, day: 20, daysInMonth: 30 },
    lead: {
      needCents: 0,
      wantCents: 0,
      openCents: 0,
      freeCents: 0,
      daysToPayday: 10,
      chain: [],
      items: { need: [], want: [], open: [] },
    },
    balance: { actual: [], forecast: [], salary: null, low: null },
    netWorth: missingFx
      ? {
          unavailable: {
            reason: 'missing_fx',
            message: 'EUR-Umrechnung fehlt',
            asOf: '2026-09-20',
          },
        }
      : {
          totalCents: 11400,
          assetsCents: 11400,
          liabilitiesCents: 0,
          monthChange: { deltaCents: 1400, investmentsInCents: 0, marketCents: 1400 },
          liquidCents: 0,
          investedCents: 11400,
          receivableCents: 0,
          debtCents: 0,
          asOf: '2026-09-20',
          previousMonthEndCents: 10000,
          yearAgoCents: 10000,
          yearAgoDay: '2025-09-20',
          yearDeltaCents: 1400,
          deltaCents: 1400,
          deltaBp: 1400,
          series: [],
        },
  };
  function Subject() {
    const budget = useQuery<BudgetMonthView>({
      queryKey: ['synthetic-kpi-budget'],
      queryFn: () => {
        throw new Error('Disabled synthetic budget query must not fetch');
      },
      enabled: false,
    });
    return <Kennzahlen data={props} budget={budget} onLeadClick={() => {}} />;
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Subject />
    </QueryClientProvider>,
  );
}
it.each(['cost', 'stale'] as const)(
  'marks the literal top net-worth KPI directly for %s without changing its amount',
  (kind) => {
    const source: ValuationSource =
      kind === 'cost'
        ? kpiSource
        : {
            ...kpiSource,
            kind: 'quote',
            quality: 'stale',
            date: '2026-09-12',
          };
    const { container } = renderKpi(source);
    const value = container.querySelector('[data-kennzahl="nettovermoegen"]')!;
    expect(value.textContent).toBe('114,00 €');
    const marker = screen.getByRole('button', {
      name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
    });
    expect(value.closest('section')?.contains(marker)).toBe(true);
    expect(marker.closest('#heute-more-content')).toBeNull();
    marker.focus();
    expect(document.activeElement).toBe(marker);
    const detail = document.getElementById(marker.getAttribute('aria-describedby')!)!;
    const show = vi.fn();
    Object.defineProperty(detail, 'showPopover', { value: show });
    fireEvent.click(marker);
    expect(show).toHaveBeenCalledOnce();
    expect(detail.textContent).toContain(
      kind === 'cost' ? 'Einstandswert als Schätzung' : 'Kurs vom 12.09.2026 fortgeschrieben',
    );
  },
);
it('retains the top KPI missing-FX reason without inventing a complete EUR amount', () => {
  const { container } = renderKpi(
    {
      ...kpiSource,
      kind: 'quote',
      quality: 'exact',
      date: '2026-09-20',
      currency: 'USD',
      missing: 'fx',
      fx: { kind: 'missing', date: null, source: null },
    },
    true,
  );
  expect(container.querySelector('[data-kennzahl="nettovermoegen"]')).toBeNull();
  expect(screen.getByText('EUR-Umrechnung fehlt')).toBeTruthy();
  const marker = screen.getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
  });
  expect(document.getElementById(marker.getAttribute('aria-describedby')!)?.textContent).toContain(
    'EUR-Umrechnung fehlt · USD',
  );
});
it('keeps the affected top KPI marker and reason while the amount is private', () => {
  act(() => setAmountsHidden(true));
  const { container } = renderKpi(kpiSource);
  expect(container.querySelector('[data-kennzahl="nettovermoegen"]')?.textContent).toBe('••• €');
  const marker = screen.getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
  });
  marker.focus();
  expect(document.activeElement).toBe(marker);
  const detail = document.getElementById(marker.getAttribute('aria-describedby')!)!;
  expect(detail.textContent).toContain('Einstandswert als Schätzung');
  expect(detail.textContent).not.toContain('114');
  expect(marker.outerHTML).not.toContain('114');
});
it('does not mark the top KPI for an exact same-day quote with identity FX', () => {
  renderKpi({
    ...kpiSource,
    kind: 'quote',
    quality: 'exact',
    date: '2026-09-20',
    quoteNeeded: false,
  });
  expect(
    screen.queryByRole('button', { name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl' }),
  ).toBeNull();
});

it('keeps all four populated Q3 sources within four rows while preserving every account action', () => {
  const full = data(3);
  full.nextSteps = {
    count: 1,
    items: [
      {
        kind: 'overspent',
        urgent: true,
        categoryId: 'synthetic',
        categoryName: 'Synthetic',
        cents: -100,
        count: 1,
      },
    ],
  };
  full.financeCheck = {
    actionRules: [
      {
        code: 'R1',
        status: 'bad',
        name: 'Synthetic rule',
        valueText: 'Synthetic',
        actionText: 'Prüfen',
      },
    ],
    counts: { ok: 0, warn: 0, bad: 1, total: 1, notEvaluated: 0 },
    keyRules: [],
  };
  full.attention = { ...full.attention, inboxCount: 2, pendingCount: 4, loanTermsMissing: true };
  full.accountReminders = [
    { accountId: 'synthetic-a', accountName: 'Synthetic A', days: 15, action: 'reconcile' },
    { accountId: 'synthetic-b', accountName: 'Synthetic B', days: 32, action: 'value' },
  ];
  const { container } = render(<AttentionBar data={full} />);
  const rows = container.querySelectorAll('.attention-row');
  expect(rows).toHaveLength(4);
  expect(rows[0]?.textContent).toContain('1 Kategorie überzogen');
  expect(rows[1]?.textContent).toContain('1 Regelbefund zum Handeln');
  expect(rows[2]?.textContent).toContain('2 unter Prüfen');
  expect(rows[2]?.textContent).toContain('4 unbestätigte Buchungen');
  expect(rows[3]?.textContent).toContain('2 Konten warten auf Prüfung');
  expect(rows[3]?.textContent).toContain('3 Wertpapiere ohne aktuellen Kurs');
  expect(rows[3]?.textContent).toContain('Kreditkonditionen fehlen');
  for (const [label, href] of [
    ['Prüfen', '/konten/pruefen'],
    ['Kurse prüfen', '/vermoegen/portfolio/positionen'],
    ['Konditionen ergänzen', '/einstellungen/konten'],
  ] as const) {
    const link = screen.getByRole('link', { name: label });
    expect(rows[3]?.contains(link)).toBe(true);
    expect(link.getAttribute('href')).toBe(href);
  }
});
it('keeps the top amount selector unique and annotation outside its exact money text', () => {
  const { container } = renderKpi(kpiSource);
  const tile = container.querySelector('[data-kennzahl="nettovermoegen"]')!.closest('section')!;
  expect(tile.querySelectorAll('.heute-answer-value')).toHaveLength(1);
  expect(tile.querySelector('.heute-answer-value')?.textContent).toBe('114,00 €');
  const figure = tile.querySelector('.heute-kennzahl-figure')!;
  expect(figure.classList.contains('heute-answer-value')).toBe(false);
  expect(
    figure.contains(
      screen.getByRole('button', { name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl' }),
    ),
  ).toBe(true);
});
