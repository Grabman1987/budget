import { describe, expect, it } from 'vitest';
import {
  chainTerms,
  compositionGeometry,
  compositionWidthPercent,
  kfmt,
  monthTicks,
  periodText,
  portfolioIndexAxis,
  yTicks,
} from './networth-model';

describe('periodText', () => {
  it('names the window as the prototype does', () => {
    expect(periodText('YTD', '2025-12-31')).toBe('seit Jahresbeginn');
    expect(periodText('1M', '2026-08-17')).toBe('letzter Monat');
    expect(periodText('3M', '2026-06-17')).toBe('letzte 3 Monate');
    expect(periodText('1J', '2025-09-17')).toBe('letzte 12 Monate');
    expect(periodText('3J', '2023-09-17')).toBe('letzte 3 Jahre');
    expect(periodText('Alles', '2023-10-01')).toBe('seit Okt 2023');
  });
});

describe('chainTerms', () => {
  it('Anfang + Eigenleistung + Markt = jetzt, a negative term is subtracted by its magnitude', () => {
    const terms = chainTerms(
      { startCents: 7_000_000, ownCents: 1_500_000, marketCents: -200_000, nowCents: 8_300_000 },
      '2025-12-31',
    );
    expect(terms).toEqual([
      { label: 'Anfang Dez 2025', value: 7_000_000 },
      { label: 'Eigenleistung', value: 1_500_000, op: '+' },
      { label: 'Markt', value: 200_000, op: '-' },
      { label: 'jetzt', value: 8_300_000, op: '=', result: true },
    ]);
  });
});

describe('signed composition geometry', () => {
  it('positions account amounts around zero using the positive and debt ranges', () => {
    const geometry = compositionGeometry([600_000, 300_000], [-200_000, -50_000]);
    expect(geometry.zeroPercent).toBe(25);
    expect(geometry.spanCents).toBe(800_000);
    expect(
      [600_000, 300_000, -200_000, -50_000].map((value) =>
        compositionWidthPercent(value, geometry.spanCents),
      ),
    ).toEqual([75, 37.5, 25, 6.25]);
  });

  it('handles tiny signed values, one-sided ranges and empty/zero composition', () => {
    const tiny = compositionGeometry([3], [-2]);
    expect(tiny).toEqual({ zeroPercent: 40, spanCents: 5 });
    expect(compositionWidthPercent(3, tiny.spanCents)).toBe(60);
    expect(compositionWidthPercent(-2, tiny.spanCents)).toBe(40);
    expect(compositionGeometry([10], [])).toEqual({ zeroPercent: 0, spanCents: 10 });
    expect(compositionGeometry([], [-10])).toEqual({ zeroPercent: 100, spanCents: 10 });
    expect(compositionGeometry([], [])).toEqual({ zeroPercent: 50, spanCents: 0 });
    expect(compositionWidthPercent(0, 0)).toBe(0);
  });
});

describe('axis helpers', () => {
  it('yTicks picks round steps like the prototype', () => {
    expect(yTicks(61_000, 87_000)).toEqual([70_000, 80_000]);
    expect(yTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
  });
  it('kfmt writes thousands as "80 T"', () => {
    expect(kfmt(80_000)).toBe('80 T');
    expect(kfmt(950)).toBe('950');
    expect(kfmt(2_500)).toBe('3 T');
  });
  it('monthTicks marks month starts, thinned to fit the width', () => {
    const days = [
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
      '2026-03-01',
      '2026-04-01',
    ];
    expect(monthTicks(days, 10_000).map((t) => t.index)).toEqual([2, 4, 5]);
    expect(monthTicks(days, 100).map((t) => t.index)).toEqual([2, 5]);
  });
  it('pads flat index history and keeps small-range tick labels distinct', () => {
    const flat = portfolioIndexAxis([100, 100]);
    expect(flat.min).toBeLessThan(100);
    expect(flat.max).toBeGreaterThan(100);
    expect(flat.ticks).toContain(100);

    const narrow = portfolioIndexAxis([100, 100.3]);
    const labels = narrow.ticks.map((tick) =>
      new Intl.NumberFormat('de-AT', { maximumFractionDigits: narrow.fractionDigits }).format(tick),
    );
    expect(new Set(labels).size).toBe(labels.length);

    const tiny = portfolioIndexAxis([100, 100.00000001]);
    const tinyLabels = tiny.ticks.map((tick) =>
      new Intl.NumberFormat('de-AT', { maximumFractionDigits: tiny.fractionDigits }).format(tick),
    );
    expect(tiny.ticks.length).toBeLessThanOrEqual(5);
    expect(new Set(tinyLabels).size).toBe(tinyLabels.length);
  });
});
