// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlagPicker } from './flag-picker';
import type { BookingFlag } from './types';

afterEach(cleanup);

function Harness({ onChange }: { onChange?: (flag: BookingFlag | '') => void }) {
  const [flag, setFlag] = useState<BookingFlag | ''>('');
  return (
    <FlagPicker
      value={flag}
      onChange={(next) => {
        setFlag(next);
        onChange?.(next);
      }}
    />
  );
}

describe('FlagPicker', () => {
  it('names the current flag on the button and lists six colours plus "keine" with their keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Markierung: keine' });
    await user.click(button);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'Rot1',
      'Orange2',
      'Gelb3',
      'Grün4',
      'Blau5',
      'Violett6',
      'keine0',
    ]);
    // The current choice (keine) has the focus and is the checked one.
    expect(items[6]).toBe(document.activeElement);
    expect(items[6]?.getAttribute('aria-checked')).toBe('true');
  });

  it('picks by number key, closes and gives the focus back to the button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Markierung: keine' }));
    await user.keyboard('4');
    expect(onChange).toHaveBeenCalledWith('green');
    expect(screen.queryByRole('menu')).toBeNull();
    const button = screen.getByRole('button', { name: 'Markierung: Grün' });
    expect(button).toBe(document.activeElement);
    // 0 removes the flag again.
    await user.keyboard('{Enter}');
    await user.keyboard('0');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('moves with the arrow keys, picks with Enter and closes with Esc without leaking it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onParentKey = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onKeyDown={(e) => e.key === 'Escape' && onParentKey()}>
        <Harness onChange={onChange} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Markierung: keine' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Rot1');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('orange');
    await user.click(screen.getByRole('button', { name: 'Markierung: Orange' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    // The dialog around the picker keeps its own Esc: it must not see this one.
    expect(onParentKey).not.toHaveBeenCalled();
  });
});
