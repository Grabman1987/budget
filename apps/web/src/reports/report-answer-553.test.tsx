// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportAnswer, reportAnswer, reportAnswerWindow } from './report-answer';
import { eur } from '../ledger/format';

afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});

const facts = {
  totalCents: 213000,
  previousCents: 183000,
  metric: 'expenses' as const,
  biggestRiser: { name: 'Lebensmittel', changeCents: 12000 },
};

describe('shared report answer from integer-cent facts', () => {
  it('uses the same literal cents as the lead and the independently summed chart groups', () => {
    const chartGroups = [122000, 71000, 20000];
    expect(chartGroups.reduce((sum, value) => sum + value, 0)).toBe(213000);
    expect(reportAnswer(facts)).toMatchObject({
      totalCents: 213000,
      previousCents: 183000,
      changeCents: 30000,
      favourable: false,
      neutral: false,
    });
    render(
      <>
        <strong data-testid="lead">{eur(213000)}</strong>
        <ReportAnswer facts={facts} />
      </>,
    );
    expect(screen.getByTestId('lead').textContent).toBe('2.130,00 €');
    expect(screen.getByTestId('report-answer').textContent).toBe(
      'Du hast 2.130,00 € netto ausgegeben, 300,00 € mehr als im gleich langen Vorzeitraum. Den größten Anstieg gab es bei Lebensmittel: +120,00 €.',
    );
    expect(screen.getByText('Vorzeitraum 1.830,00 € · +300,00 €').className).toContain(
      'is-unfavourable',
    );
  });

  it.each([
    ['income', 213000, true],
    ['expenses', 213000, false],
    ['income', 153000, false],
    ['expenses', 153000, true],
  ] as const)(
    'derives %s direction for %i cents without a conflicting caller flag',
    (metric, totalCents, favourable) => {
      expect(reportAnswer({ totalCents, previousCents: 183000, metric })?.favourable).toBe(
        favourable,
      );
    },
  );

  it('keeps a real zero comparison distinct from missing prior data and equal amounts neutral', () => {
    expect(reportAnswer({ totalCents: 1, previousCents: 0, metric: 'income' })?.changeCents).toBe(
      1,
    );
    expect(reportAnswer({ totalCents: 1, previousCents: 1, metric: 'income' })).toMatchObject({
      changeCents: 0,
      neutral: true,
      favourable: false,
    });
    render(
      <>
        <strong data-testid="lead">{eur(213000)}</strong>
        <ReportAnswer facts={{ ...facts, previousCents: null }} />
      </>,
    );
    expect(screen.queryByTestId('report-answer')).toBeNull();
    expect(screen.getByTestId('lead').textContent).toBe('2.130,00 €');
  });

  it('masks total, prior, delta and riser while retaining the sentence meaning', () => {
    render(<ReportAnswer facts={facts} />);
    act(() => setAmountsHidden(true));
    const text = screen.getByTestId('report-answer').textContent!;
    expect(text).not.toMatch(/2\.130|300,00|120,00/);
    expect(text).toContain('••• € netto ausgegeben');
    expect(text).toContain('Lebensmittel');
    expect(screen.getByText('Vorzeitraum ••• € · ••• €')).toBeTruthy();
  });

  it('does not narrate a non-positive riser and rejects unsafe or fractional cents', () => {
    render(
      <ReportAnswer facts={{ ...facts, biggestRiser: { name: 'Lebensmittel', changeCents: 0 } }} />,
    );
    expect(screen.getByTestId('report-answer').textContent).not.toContain('Lebensmittel');
    for (const invalid of [NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => reportAnswer({ ...facts, totalCents: invalid })).toThrow(RangeError);
      expect(() => reportAnswer({ ...facts, previousCents: invalid })).toThrow(RangeError);
      expect(() =>
        reportAnswer({ ...facts, biggestRiser: { name: 'Test', changeCents: invalid } }),
      ).toThrow(RangeError);
    }
    expect(() =>
      reportAnswer({ ...facts, totalCents: Number.MAX_SAFE_INTEGER, previousCents: -1 }),
    ).toThrow(RangeError);
  });
});

describe('separate equal-calendar-day report answer window', () => {
  it.each([
    ['2024-02-28', '2024-03-02', '2024-02-24', '2024-02-27', 4],
    ['2026-03-28', '2026-03-31', '2026-03-24', '2026-03-27', 4],
    ['2026-10-24', '2026-10-27', '2026-10-20', '2026-10-23', 4],
    ['2026-03-31', '2026-04-30', '2026-02-28', '2026-03-30', 31],
    ['2026-01-01', '2026-01-01', '2025-12-31', '2025-12-31', 1],
  ] as const)(
    'uses inclusive civil days for %s through %s',
    (from, to, previousFrom, previousTo, days) => {
      expect(reportAnswerWindow(from, to)).toEqual({ from, to, previousFrom, previousTo, days });
    },
  );

  it.each([
    ['2026-02-30', '2026-03-02'],
    ['2026-03-02', '2026-03-01'],
    ['2026-3-01', '2026-03-02'],
    ['not-a-date', '2026-03-02'],
  ])('rejects invalid or reversed windows %s..%s', (from, to) => {
    expect(() => reportAnswerWindow(from, to)).toThrow(RangeError);
  });
});
