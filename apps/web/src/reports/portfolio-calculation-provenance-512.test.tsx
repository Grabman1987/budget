// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestDatabase, portfolioSummary } from '@budget/db';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { PortfolioCalculationDisclosure } from './portfolio-calculation-disclosure-512';
import { portfolioPerformanceQuery } from '../wealth/portfolio-api';
import { LEDGER_KEY } from '../ledger/queries';
import { request } from '../api/http';

// Same visibility conditions as a DOM visibility matcher, without adding a matcher package.
function isVisible(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.ownerDocument.documentElement.contains(element)) return false;
  let child: HTMLElement | null = null;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0' ||
      node.hidden
    )
      return false;
    if (node.tagName === 'DETAILS' && !node.hasAttribute('open') && child?.tagName !== 'SUMMARY')
      return false;
    child = node;
  }
  return true;
}

vi.mock('../api/http', () => ({ request: vi.fn() }));
const resources: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => {
  cleanup();
  for (const r of resources.splice(0)) r.close();
  vi.clearAllMocks();
});
function summary(
  options: { legacy?: boolean; empty?: boolean; unrelatedFx?: boolean; twoRuns?: boolean } = {},
) {
  const f = createTestDatabase();
  resources.push(f);
  if (!options.empty)
    f.sqlite.exec(`
    INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('a','Musterdepot','brokerage','investment',0,'2026-09-18');
    INSERT INTO security(id,name,kind) VALUES ('s','Musterwertpapier','stock');
    INSERT INTO holding(id,account_id,security_id,as_of,units_e8,cost_basis_cents) VALUES ('h','a','s','2026-09-18',100000000,10000);
    INSERT INTO price(security_id,date,price_micro,currency,source) VALUES ('s','2026-09-18',114000000,'EUR','manual');
  `);
  if (options.twoRuns)
    f.sqlite.exec(
      "INSERT INTO price(security_id,date,price_micro,currency,source) VALUES ('s','2026-09-20',114000000,'EUR','manual')",
    );
  if (options.unrelatedFx)
    f.sqlite.exec(
      "INSERT INTO account(id,name,type,role,on_budget,currency,allocation_scope,opening_date,opening_balance_cents) VALUES ('usd','Andere Allokationskassa','checking','investment',0,'USD','included','2026-09-18',10000)",
    );
  return portfolioSummary(f.db, {
    today: '2026-09-20',
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    ...(options.legacy ? {} : { valuationProvenance: 'valuation-v1' as const }),
  });
}

it('keeps the absent-metadata limitation and does not infer historical sources from current quality', () => {
  const data = summary({ legacy: true });
  render(<PortfolioCalculationDisclosure summary={data} />);
  expect(
    isVisible(screen.getByText(/Quellen der einzelnen historischen Tageswerte.*nicht vollständig/)),
  ).toBe(true);
  expect(screen.queryByText('Historische Bewertungsquellen')).toBeNull();
});

it('shows the actual closing source dates and limited complete scope independently of unrelated allocation FX', async () => {
  const data = summary({ unrelatedFx: true });
  expect(data.valueCents).toBe(11400);
  expect(data.quality.missingFxAccountIds).toEqual(['usd']);
  expect(data.valuationProvenance?.coverage.complete).toBe(true);
  const { container } = render(<PortfolioCalculationDisclosure summary={data} />);
  await userEvent.click(screen.getByText('Historische Bewertungsquellen', { exact: true }));
  const details = container.querySelector('details')!;
  expect(
    isVisible(within(details).getByText(/3 von 3 Positionstagen dokumentiert.*3 Schlussstichtage/)),
  ).toBe(true);
  expect(
    isVisible(within(details).getByText(/Gespeicherter Kurs vom 18.09.2026.*EUR.*Quelle: manual/)),
  ).toBe(true);
  expect(isVisible(within(details).getByText(/EUR ohne Währungsumrechnung/))).toBe(true);
  expect(
    isVisible(
      within(details).getByText(/bestätigt weder exakte Werte noch sämtliche Eingaben der Rendite/),
    ),
  ).toBe(true);
  expect(
    isVisible(
      within(details).getByText(
        /Zahlungsflüsse.*Wechselkurse.*Gebühren\/Steuern.*Vergleichsindizes/,
      ),
    ),
  ).toBe(true);
  expect(within(details).queryByText(/Wechselkurs fehlt/)).toBeNull();
  expect(details.textContent).not.toContain('114');
  expect(details.querySelector('[title]')).toBeNull();
});

it('discloses exact omissions rather than treating truncated metadata as an exact return', async () => {
  const data = summary();
  const metadata = data.valuationProvenance!;
  data.valuationProvenance = {
    ...metadata,
    runs: [],
    coverage: {
      ...metadata.coverage,
      retainedPositionDays: '0',
      omittedPositionDays: '3',
      retainedRuns: 0,
      omittedRuns: '1',
      complete: false,
      truncated: true,
      byteLimit: true,
    },
  };
  render(<PortfolioCalculationDisclosure summary={data} />);
  await userEvent.click(screen.getByText('Historische Bewertungsquellen', { exact: true }));
  expect(
    isVisible(screen.getByText(/Anzeige begrenzt: 3 Positionstage in 1 Intervallen fehlen/)),
  ).toBe(true);
  expect(isVisible(screen.getByText(/Quellenangaben.*nicht vollständig dokumentiert/))).toBe(true);
  expect(
    isVisible(screen.getByText(/Berechnung umfasst weiterhin den gesamten gewählten Zeitraum/)),
  ).toBe(true);
});

it('labels two source runs of the same position as intervals rather than inventing a second position', async () => {
  const data = summary({ twoRuns: true });
  expect(data.valuationProvenance?.runs).toHaveLength(2);
  const { container } = render(<PortfolioCalculationDisclosure summary={data} />);
  await userEvent.click(screen.getByText('Historische Bewertungsquellen', { exact: true }));
  const details = container.querySelector('details')!;
  expect(isVisible(within(details).getByText(/Musterwertpapier · Intervall 1/))).toBe(true);
  expect(isVisible(within(details).getByText(/Musterwertpapier · Intervall 2/))).toBe(true);
  expect(within(details).queryByText(/Position 2/)).toBeNull();
});

it('keeps no-history explicitly unavailable with no fabricated historical day', async () => {
  render(<PortfolioCalculationDisclosure summary={summary({ empty: true })} />);
  await userEvent.click(screen.getByText('Historische Bewertungsquellen', { exact: true }));
  expect(isVisible(screen.getByText(/Keine Bewertungshistorie vorhanden/))).toBe(true);
  expect(screen.queryByText(/Ausgewerteter Zeitraum/)).toBeNull();
  expect(screen.queryByText(/vollständig dokumentiert/)).toBeNull();
});

it('uses one explicit versioned request/key for both existing consumers, separate from legacy cached data', async () => {
  const data = { portfolio: summary() };
  vi.mocked(request).mockResolvedValue(data);
  const client = new QueryClient();
  try {
    client.setQueryData([...LEDGER_KEY, 'portfolio-performance-report', 'Alles', 'securities'], {
      portfolio: 'legacy-cache',
    });
    const query = portfolioPerformanceQuery('Alles');
    expect(query.queryKey).toEqual([
      ...LEDGER_KEY,
      'portfolio-performance-report',
      'Alles',
      'securities',
      'valuation-v1',
    ]);
    expect(await client.fetchQuery({ ...query, staleTime: Infinity })).toEqual(data);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'GET',
      '/api/portfolio?period=Alles&view=securities&history=performance&provenance=valuation-v1',
    );
    await client.invalidateQueries({ queryKey: LEDGER_KEY });
    expect(client.getQueryState(query.queryKey)?.isInvalidated).toBe(true);
  } finally {
    client.clear();
  }
});
