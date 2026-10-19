// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookingStatusChips } from './booking-status-chips';
import type { BookingStatus } from './types';

afterEach(cleanup);

it('exposes one selected status, all three existing statuses, and an explicit clear shortcut', async () => {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState<BookingStatus>();
    return (
      <BookingStatusChips
        value={value}
        onChange={(next) => {
          setValue(next);
          changed(next);
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const group = within(screen.getByRole('group', { name: 'Nach Status filtern' }));
  const all = group.getByRole('button', { name: 'Alle Status' });
  expect(all.getAttribute('aria-pressed')).toBe('true');
  for (const [name, value] of [
    ['vorgemerkt', 'pending'],
    ['bestätigt', 'confirmed'],
    ['geprüft', 'reconciled'],
  ] as const) {
    const chip = group.getByRole('button', { name: `Status filtern: ${name}` });
    await user.click(chip);
    expect(changed).toHaveBeenLastCalledWith(value);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(
      group
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
    expect(within(chip).getByText(name)).toBeTruthy();
  }
  await user.click(all);
  expect(changed).toHaveBeenLastCalledWith(undefined);
  expect(all.getAttribute('aria-pressed')).toBe('true');
});
