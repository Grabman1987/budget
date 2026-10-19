// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import * as charts from './index';
import { ChartSvg, ChartValue, ChartValues, type ChartSvgProps } from './frame';
import { setAmountsHidden } from '../amount-privacy';

const label = 'Musterbestand: 123,45 €; letzter Wert −0,01 €.';
const points = [
  {
    x: 20,
    date: '2026-10',
    series: [
      { name: 'Bestand', value: '123,45 €' },
      { name: 'Anteil', value: '−12,34 %' },
      { name: 'Preis', value: '0,000001 EUR' },
    ],
  },
  {
    x: 80,
    date: '2026-10-02',
    series: [
      { name: 'Bestand', value: '−0,01 €' },
      { name: 'Nicht vorhanden', value: '–' },
    ],
  },
];
const svg = (table = true) => (
  <ChartSvg width={100} height={120} label={label} points={points} table={table}>
    <charts.Line
      kind="actual"
      points={[
        [20, 80],
        [80, 20],
      ]}
      draw={false}
    />
  </ChartSvg>
);

afterEach(() => act(() => setAmountsHidden(false)));

describe('public chart accessibility contract', () => {
  const examples: Record<string, ReactElement> = {
    ChartSvg: svg(false),
    ChartValues: (
      <ChartValues label={label} points={points}>
        <span>Zeichnung</span>
      </ChartValues>
    ),
    ChartValue: (
      <ChartValue label={label} date="2026-10" series={points[0]!.series}>
        <span>Balken</span>
      </ChartValue>
    ),
  };

  it('requires a named contract test when another public chart container is exported', () => {
    // Marks are composed inside an image; the context is not a drawing container.
    const primitives = [
      'AxisLine',
      'Band',
      'BarsAroundZero',
      'ClassPatterns',
      'DimensionLine',
      'ElevationMark',
      'Graticule',
      'Line',
      'LineLegend',
      'SlashTick',
      'StepLine',
      'TodayLine',
      'TrendLine',
      'XTicks',
      'ReportTrendContext',
    ];
    expect(
      Object.keys(charts)
        .filter((name) => /^[A-Z]/.test(name))
        .sort(),
    ).toEqual([...Object.keys(examples), ...primitives].sort());
    expectTypeOf<ChartSvgProps['label']>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof ChartValues>[0]['label']>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof ChartValue>[0]['label']>().toEqualTypeOf<string>();
  });

  it.each(Object.keys(examples))('%s exposes one image named by its data statement', (name) => {
    render(examples[name]!);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: label })).toBeTruthy();
  });

  it('preserves links in an interactive SVG while exposing the chart summary', () => {
    render(
      <ChartSvg width={100} height={100} label={label} role="group">
        <a href="/details">
          <text x={0} y={20}>
            Details
          </text>
        </a>
      </ChartSvg>,
    );
    expect(screen.getByRole('img', { name: label })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Details' }).getAttribute('href')).toBe('/details');
  });

  it('preserves native HTML tables and controls instead of flattening them into an image', () => {
    render(
      <ChartValues label={label} points={points}>
        <table>
          <caption>Bestehende Wertetabelle</caption>
          <tbody>
            <tr>
              <td>
                <a href="/details">Buchungen</a>
              </td>
            </tr>
          </tbody>
        </table>
      </ChartValues>,
    );
    expect(screen.getByRole('img', { name: label })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Bestehende Wertetabelle' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Buchungen' })).toBeTruthy();
  });

  it('keeps the default SVG fallback singly labelled when optional content is null', () => {
    render(
      <ChartSvg width={100} height={100} label={label} content={null}>
        <path d="M0 0L10 10" />
      </ChartSvg>,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('exposes a data-rich HTML bar summary once while its drawing remains neutral', () => {
    const statement = 'Bedarf 50 %, Wunsch 30 %, Zukunft 20 %';
    render(
      <ChartValue label={statement} date="2026-10" series={points[0]!.series}>
        <div className="sr-seg">
          <span />
          <span />
          <span />
        </div>
      </ChartValue>,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: statement })).toBeTruthy();
  });
});

describe('optional exact plotted-value table', () => {
  it('discloses every value verbatim, preserving order, signs, precision and missing values', async () => {
    render(svg());
    const summary = screen.getByText('Tabelle anzeigen');
    // JSDOM lacks closed-details visibility and summary's native Enter action; E2E covers both.
    expect(summary.closest('details')!.open).toBe(false);
    await userEvent.click(summary);
    expect(summary.closest('details')!.open).toBe(true);
    const table = screen.getByRole('table', { name: label });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => Array.from(row.children, (cell) => cell.textContent))).toEqual([
      ['Oktober 2026', 'Bestand', '123,45 €'],
      ['Oktober 2026', 'Anteil', '−12,34 %'],
      ['Oktober 2026', 'Preis', '0,000001 EUR'],
      ['02.10.2026', 'Bestand', '−0,01 €'],
      ['02.10.2026', 'Nicht vorhanden', '–'],
    ]);
    fireEvent.focus(screen.getByRole('group', { name: label }));
    expect(screen.getByRole('status').textContent).toContain('123,45 €');
    expect(table.closest('[role="img"]')).toBeNull();
    await userEvent.click(summary);
    expect(summary.closest('details')!.open).toBe(false);
  });

  it('masks summary, caption and table values while retaining dates and series identity', async () => {
    render(svg());
    await userEvent.click(screen.getByText('Tabelle anzeigen'));
    act(() => setAmountsHidden(true));
    const table = screen.getByRole('table');
    expect(table.textContent).not.toMatch(/123,45|12,34|0,000001|0,01/);
    expect(within(table).getAllByText('•••')).toHaveLength(5);
    expect(table.textContent).toContain('02.10.2026');
    expect(table.textContent).toContain('Bestand');
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toContain('123,45');
    act(() => setAmountsHidden(false));
    expect(table.textContent).toContain('0,000001 EUR');
  });

  it('updates the same open table when plotted values change', async () => {
    const { rerender } = render(svg());
    await userEvent.click(screen.getByText('Tabelle anzeigen'));
    rerender(
      <ChartSvg
        width={100}
        height={100}
        label={label}
        table
        points={[{ x: 20, date: '2026-11', series: [{ name: 'Bestand', value: '999,99 €' }] }]}
      >
        {null}
      </ChartSvg>,
    );
    expect(within(screen.getByRole('table')).getByText('999,99 €')).toBeTruthy();
    expect(screen.getByRole('table').textContent).not.toContain('0,000001');
  });

  it('adds no disclosure when not requested or when the chart has no inspected values', () => {
    const { rerender } = render(svg(false));
    expect(screen.queryByText('Tabelle anzeigen')).toBeNull();
    rerender(
      <ChartSvg width={100} height={100} label="Keine Werte" points={[]} table>
        {null}
      </ChartSvg>,
    );
    expect(screen.queryByText('Tabelle anzeigen')).toBeNull();
  });
});
