// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusCell } from './booking-cells';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));
beforeEach(() => {
  flag.enabled = true;
});

describe('S2 booking status presentation adapter', () => {
  it.each([
    ['pending', 'vorgemerkt', 'booking-status-pending', 'lucide-clock'],
    ['confirmed', 'bestätigt', 'lucide-check-check', 'lucide-check'],
    ['reconciled', 'geprüft', 'lucide-lock', 'lucide-circle-check'],
  ] as const)(
    'changes only the %s glyph ON and preserves the OFF glyph',
    (status, label, on, off) => {
      const { rerender } = render(<StatusCell status={status} iconOnly />);
      expect(screen.getByRole('img', { name: label }).querySelector(`svg.${on}`)).toBeTruthy();
      flag.enabled = false;
      rerender(<StatusCell status={status} iconOnly />);
      expect(screen.getByRole('img', { name: label }).querySelector(`svg.${off}`)).toBeTruthy();
    },
  );

  it.each(['pending', 'confirmed'] as const)(
    'preserves native toggle and disabled behavior for %s',
    async (status) => {
      const toggle = vi.fn();
      const label = status === 'pending' ? 'vorgemerkt' : 'bestätigt';
      const { rerender } = render(<StatusCell status={status} onToggle={toggle} />);
      const button = screen.getByRole('button', { name: label });
      await userEvent.click(button);
      expect(toggle).toHaveBeenCalledTimes(1);
      rerender(<StatusCell status={status} onToggle={toggle} disabled />);
      await userEvent.click(button);
      expect(toggle).toHaveBeenCalledTimes(1);
      expect(button.textContent).toBe(label);
    },
  );

  it('does not invent a transition or clickable lock for a read-only reconciled cell', () => {
    render(<StatusCell status="reconciled" iconOnly />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'geprüft' })).toBeTruthy();
  });
});
