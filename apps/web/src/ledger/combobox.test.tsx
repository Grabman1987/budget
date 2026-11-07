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
  captureInline = false,
}: {
  onSelect: (o: ComboOption) => void;
  onParentKey?: () => void;
  pickFirst?: boolean;
  captureCategory?: boolean;
  captureInline?: boolean;
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
        captureInline={captureInline}
      />
    </div>
  );
}

describe('Combobox', () => {
  it.each([
    { fraction: 0, rowOffset: 0, resizedHeight: 200 },
    { fraction: 0.25, rowOffset: 0, resizedHeight: 200 },
    { fraction: 0, rowOffset: 0.796875, resizedHeight: 200 },
    { fraction: 0, rowOffset: 113.796875, resizedHeight: 333 },
  ])(
    'keeps inline results visible after resize with fractional body $fraction and row $rowOffset',
    async ({ fraction, rowOffset, resizedHeight }) => {
      let bodyScroll = 0;
      let bodyHeight = 400;
      const listHeight = () =>
        Number.parseFloat(screen.queryByRole('listbox')?.style.maxHeight || '220');
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.classList.contains('bk-body')) return new DOMRect(16, 50, 358, bodyHeight);
        if (this.classList.contains('field-row'))
          return new DOMRect(28, 50 + rowOffset - bodyScroll, 334, 45 + listHeight());
        if (this.classList.contains('combo-list'))
          return new DOMRect(28, 95 + rowOffset - bodyScroll, 334, listHeight());
        if (this.getAttribute('role') === 'option') {
          const index = Number(this.id.split('-').at(-1));
          return new DOMRect(
            28,
            95 + rowOffset - bodyScroll + index * 88 - this.closest('ul')!.scrollTop,
            334,
            44,
          );
        }
        return new DOMRect(28, 50, 334, 44);
      });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('combo-list') ? listHeight() : Math.floor(bodyHeight);
      });
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <div className="bk-body">
          <Harness onSelect={onSelect} captureInline captureCategory />
        </div>,
      );
      Object.defineProperty(document.querySelector('.bk-body')!, 'scrollTop', {
        get: () => bodyScroll,
        set: (value: number) => {
          bodyScroll = Math.trunc(value);
        },
        configurable: true,
      });
      const field = screen.getByRole('combobox');
      await user.click(field);
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      const list = screen.getByRole('listbox');
      expect(list.tabIndex).toBe(-1);
      expect(list.scrollTop).toBe(0);
      act(() => {
        bodyHeight = resizedHeight + fraction;
        window.dispatchEvent(new Event('resize'));
      });
      // WebKit quantizes scrollTop even when the row position and body height are fractional.
      expect(list.getBoundingClientRect().bottom).toBeLessThanOrEqual(50 + resizedHeight);
      expect(field.closest('.field-row')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(50);
      const scrollAfterResize = bodyScroll;
      act(() => window.dispatchEvent(new Event('resize')));
      expect(bodyScroll).toBe(scrollAfterResize);
      const selected = screen.getByRole('option', { selected: true });
      expect(selected.textContent).toBe('Reise');
      expect(selected.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        list.getBoundingClientRect().top + list.clientTop,
      );
      expect(selected.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        list.getBoundingClientRect().bottom,
      );
      expect(document.activeElement).toBe(field);
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
