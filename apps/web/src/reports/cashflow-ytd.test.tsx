// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { cashflowWindow } from '@budget/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportPeriodControl, shiftPeriod } from './period-quick-select';

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('cashflow YTD navigation', () => {
  it.each(['2027-01-15', '2027-09-17'])(
    'steps to the immediately preceding full year on %s',
    (today) => {
      expect(shiftPeriod('YTD', -1, today, '2027')).toBe('2026-01..2026-12');
      expect(shiftPeriod('YTD', 1, today, '2027')).toBeUndefined();
      expect(shiftPeriod('2026-01..2026-12', -1, today, '2027')).toBe('2025-01..2025-12');
    },
  );

  it('uses the cashflow year when the previous-period button is clicked', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-15T12:00:00Z'));
    const onChange = vi.fn();
    render(
      <ReportPeriodControl
        label="Zeitraum"
        options={[{ value: 'YTD', label: 'YTD' }]}
        value="YTD"
        onChange={onChange}
        ytdYear="2027"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voriger Zeitraum' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-01..2026-12');
  });

  it('preserves the existing shared periods used by other reports', () => {
    expect(shiftPeriod('YTD', -1, '2027-01-15')).toBe('2025-01..2025-12');
    expect(shiftPeriod('YTD', -1, '2027-09-17')).toBe('2026-01..2026-12');
    expect(cashflowWindow('YTD', '2027-01-15', '2023-10')).toEqual(['2026-12']);
    expect(shiftPeriod('3M', -1, '2027-01-15', '2027')).toBe('2026-07..2026-09');
  });
});
