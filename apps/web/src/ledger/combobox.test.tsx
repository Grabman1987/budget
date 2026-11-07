// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboOption } from './combobox';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const OPTIONS: ComboOption[] = [
  { id: 'essen', label: 'Essen', group: '2 Laufender Monat', hint: 'Verfügbar 10,00 €' },
  { id: 'miete', label: 'Miete', group: '1 Fixkosten' },
  { id: 'reise', label: 'Reise', group: '1 Fixkosten' },
];

function Harness({
  onSelect,
  onParentKey,
  pickFirst = false,
  captureCategory = false,
  captureOverlay = false,
}: {
  onSelect: (o: ComboOption) => void;
  onParentKey?: () => void;
  pickFirst?: boolean;
  captureCategory?: boolean;
  captureOverlay?: boolean;
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
        pickFirst={pickFirst}
        captureCategory={captureCategory}
        captureOverlay={captureOverlay}
      />
    </div>
  );
}

describe('Combobox', () => {
  it.each([false, true])(
    'overlays the card below the field, flips above the keyboard and retains selection (category: %s)',
    async (captureCategory) => {
      const viewport = Object.assign(new EventTarget(), {
        height: 600,
        offsetTop: 0,
        width: 390,
        offsetLeft: 0,
      });
      vi.stubGlobal('visualViewport', viewport);
      const listHeight = () =>
        Math.min(264, Number.parseFloat(screen.queryByRole('listbox')?.style.maxHeight || '220'));
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('combo-list') ? listHeight() : 44;
      });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('combo-list') ? listHeight() - 2 : 600;
      });
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(264);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.classList.contains('bk-cols')) return new DOMRect(16, 20, 358, 500);
        if (this.classList.contains('combo-list'))
          return new DOMRect(16, Number.parseFloat(this.style.top), 358, listHeight());
        if (this.getAttribute('role') === 'option') {
          const list = this.closest('ul')!;
          const index = Number(this.id.split('-').at(-1));
          return new DOMRect(
            16,
            Number.parseFloat(list.style.top) + index * 88 - list.scrollTop,
            358,
            44,
          );
        }
        // display:contents has no box; positioning must use the input itself.
        if (this.classList.contains('combo')) return new DOMRect();
        return new DOMRect(130, 180.25, 220, 44);
      });
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <div className="bk-cols">
          <Harness onSelect={onSelect} captureOverlay captureCategory={captureCategory} />
        </div>,
      );
      const field = screen.getByRole('combobox');
      await user.click(field);
      const list = screen.getByRole('listbox');
      expect(list.tabIndex).toBe(-1);
      expect(list.style.left).toBe('16px');
      expect(list.style.width).toBe('358px');
      expect(list.getBoundingClientRect().top).toBe(228.25);
      expect(list.getBoundingClientRect().height).toBe(220);
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      act(() => {
        viewport.height = 280;
        viewport.offsetTop = 40;
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      });
      expect(list.getBoundingClientRect().top).toBeGreaterThanOrEqual(40);
      expect(list.getBoundingClientRect().bottom).toBeLessThanOrEqual(180.25);
      const selected = screen.getByRole('option', { selected: true });
      expect(selected.textContent).toBe('Reise');
      expect(selected.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        list.getBoundingClientRect().top,
      );
      expect(selected.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        list.getBoundingClientRect().top + list.clientHeight,
      );
      expect(document.activeElement).toBe(field);
      const previousTop = list.style.top;
      act(() => viewport.dispatchEvent(new Event('resize')));
      expect(list.style.top).toBe(previousTop);
      await user.keyboard('{Enter}');
      expect(onSelect).toHaveBeenCalledWith(OPTIONS[2]);
    },
  );

  it.each([
    { height: 240, offsetTop: 80, anchorTop: 300 },
    { height: 120, offsetTop: 80, anchorTop: 110 },
    { height: 240, offsetTop: 120, anchorTop: 400 },
  ])('keeps capture matches selectable in a panned $height px visual viewport', async (bounds) => {
    const viewport = Object.assign(new EventTarget(), bounds, { width: 390, offsetLeft: 0 });
    vi.stubGlobal('visualViewport', viewport);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(16, bounds.anchorTop, 280, 44),
    );
    const listHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120);
    const observe = vi.fn();
    let resizeList = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => undefined) {
          resizeList = callback;
        }
        observe = observe;
        disconnect = vi.fn();
      },
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Harness onSelect={onSelect} captureCategory pickFirst />);
    // A collapsed/offset form scroller must not clip a fixed category popup to zero.
    container.style.overflowY = 'auto';
    const field = screen.getByRole('combobox', { name: 'Kategorie' });
    await user.click(field);
    await user.keyboard('mie');
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    });
    const list = screen.getByRole('listbox');
    expect(list.hidden).toBe(false);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(Number.parseFloat(list.style.maxHeight)).toBeGreaterThanOrEqual(120);
    expect(Number.parseFloat(list.style.maxHeight)).toBeLessThanOrEqual(bounds.height);
    expect(Number.parseFloat(list.style.top)).toBeGreaterThanOrEqual(bounds.offsetTop);
    expect(Number.parseFloat(list.style.top) + 120).toBeLessThanOrEqual(
      bounds.offsetTop + bounds.height,
    );
    if (bounds.anchorTop >= bounds.offsetTop + bounds.height - 44)
      expect(Number.parseFloat(list.style.top) + 120).toBeLessThan(bounds.anchorTop);
    // A different single match can wrap onto more lines without resizing the form.
    await user.clear(field);
    await user.keyboard('rei');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(observe).toHaveBeenCalledWith(list);
    const resizedHeight = Math.min(160, bounds.height);
    listHeight.mockReturnValue(resizedHeight);
    act(resizeList);
    expect(Number.parseFloat(list.style.top) + resizedHeight).toBeLessThanOrEqual(
      bounds.offsetTop + bounds.height,
    );
    await user.clear(field);
    await user.keyboard('mie');
    await user.click(screen.getByRole('option', { name: 'Miete' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'miete' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

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

  it('pickFirst: Enter after typing picks the first match; without typing it moves on', async () => {
    const onSelect = vi.fn();
    const onParentKey = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} onParentKey={onParentKey} pickFirst />);
    const field = screen.getByRole('combobox', { name: 'Kategorie' });
    await user.click(field);
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onParentKey).toHaveBeenCalledTimes(1);
    await user.keyboard('mie{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'miete' }));
    expect(onParentKey).toHaveBeenCalledTimes(1);
  });

  it('without pickFirst a typed, unhighlighted match is not picked (payee names stay free)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} />);
    await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
    await user.keyboard('mie{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
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
