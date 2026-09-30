// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboOption } from './combobox';

afterEach(cleanup);

const OPTIONS: ComboOption[] = [
  { id: 'essen', label: 'Essen', group: '2 Laufender Monat', hint: 'Verfügbar 10,00 €' },
  { id: 'miete', label: 'Miete', group: '1 Fixkosten' },
  { id: 'reise', label: 'Reise', group: '1 Fixkosten' },
];

function Harness({
  onSelect,
  onParentKey,
}: {
  onSelect: (o: ComboOption) => void;
  onParentKey?: () => void;
}) {
  const [text, setText] = useState('');
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={(e) => e.key === 'Enter' && onParentKey?.()}>
      <Combobox
        label="Kategorie"
        value={text}
        onChange={setText}
        options={OPTIONS}
        onSelect={onSelect}
        listWhenEmpty
      />
    </div>
  );
}

describe('Combobox', () => {
  it('lists everything grouped when focused, and filters while typing', async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => undefined} />);
    await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('1 Fixkosten')).toBeTruthy();
    await user.keyboard('mi');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Miete']);
  });

  it('picks the highlighted option with the arrows and Enter, and Enter then does not move on', async () => {
    const onSelect = vi.fn();
    const onParentKey = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} onParentKey={onParentKey} />);
    await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'miete' }));
    expect(onParentKey).not.toHaveBeenCalled();
  });

  it('leaves Enter to the form when nothing is highlighted', async () => {
    const onParentKey = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={() => undefined} onParentKey={onParentKey} />);
    await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
    await user.keyboard('{Enter}');
    expect(onParentKey).toHaveBeenCalledTimes(1);
  });

  it('Esc closes the list first and does not reach the panel', async () => {
    const parentKey = vi.fn();
    const user = userEvent.setup();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onKeyDown={(e) => parentKey(e.key)}>
        <Combobox
          label="Kategorie"
          value=""
          onChange={() => undefined}
          options={OPTIONS}
          onSelect={() => undefined}
          listWhenEmpty
        />
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
    expect(screen.queryByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(parentKey).not.toHaveBeenCalledWith('Escape');
  });
});
