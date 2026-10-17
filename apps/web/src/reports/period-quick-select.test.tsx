// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportPeriodControl, shiftPeriod } from './period-quick-select';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => navigate,
}));

afterEach(cleanup);

const TODAY = '2026-09-17';

describe('shiftPeriod', () => {
  it('moves a calendar range by its own length', () => {
    expect(shiftPeriod('2026-06..2026-08', -1, TODAY)).toBe('2026-03..2026-05');
    expect(shiftPeriod('2026-03..2026-05', 1, TODAY)).toBe('2026-06..2026-08');
    expect(shiftPeriod('2026-01..2026-01', -1, TODAY)).toBe('2025-12..2025-12');
  });
  it('turns the presets into the calendar window they stand for', () => {
    expect(shiftPeriod('1M', -1, TODAY)).toBe('2026-07..2026-07');
    expect(shiftPeriod('3M', -1, TODAY)).toBe('2026-03..2026-05');
    expect(shiftPeriod('1J', -1, TODAY)).toBe('2024-09..2025-08');
    expect(shiftPeriod('YTD', -1, TODAY)).toBe('2025-01..2025-12');
  });
  it('steps from YTD to the year before the one it shows, also in January', () => {
    // In January YTD shows the last full year (December of the year before).
    expect(shiftPeriod('YTD', -1, '2027-01-15')).toBe('2025-01..2025-12');
    expect(shiftPeriod('YTD', -1, '2026-09-17')).toBe('2025-01..2025-12');
  });
  it('does not step into the future, before 1900, or from Alles', () => {
    expect(shiftPeriod('2026-06..2026-08', 1, TODAY)).toBeUndefined();
    expect(shiftPeriod('2026-08..2026-09', 1, TODAY)).toBeUndefined();
    expect(shiftPeriod('YTD', 1, TODAY)).toBeUndefined();
    expect(shiftPeriod('1900-01..1900-03', -1, TODAY)).toBeUndefined();
    expect(shiftPeriod('Alles', -1, TODAY)).toBeUndefined();
  });
});

describe('ReportPeriodControl', () => {
  const options = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'].map((value) => ({
    value: value as 'YTD',
    label: value,
  }));
  const setup = (onChange = vi.fn(), value: 'YTD' | '3M' = '3M') => {
    render(
      <ReportPeriodControl label="Zeitraum" options={options} value={value} onChange={onChange} />,
    );
    return onChange;
  };

  it('shows one period segment with step buttons; the dropdown and the trend stay in the popover', () => {
    setup();
    expect(screen.getAllByRole('group', { name: 'Zeitraum' })).toHaveLength(1);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    const button = screen.getByRole('button', { name: 'Zeitraum wählen' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('combobox').querySelectorAll('option')).toHaveLength(9);
    expect(screen.getByRole('switch', { name: 'Trendlinie' }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('steps back and forth, and disables a step that would leave the calendar', () => {
    const onChange = setup(vi.fn(), '3M');
    fireEvent.click(screen.getByRole('button', { name: 'Voriger Zeitraum' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatch(/^\d{4}-\d{2}\.\.\d{4}-\d{2}$/);
    expect(screen.getByRole('button', { name: 'Nächster Zeitraum' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('Escape closes the popover and gives the focus back', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Zeitraum wählen' });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('chooses a quick range, applies it and closes the popover', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Zeitraum wählen' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'year' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
