// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSearch } from './global-search';
import { REPORTS } from '../nav/reports-catalog';
import { amountsHidden, setAmountsHidden } from '@budget/ui';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
beforeEach(() => {
  navigate.mockClear();
  setAmountsHidden(false);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ results: [] }))),
  );
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  const input = screen.getByRole('combobox', { name: 'Suchen' });
  fireEvent.focus(input);
  return input;
}
describe('command palette', () => {
  it.each(REPORTS)('finds report $pos by position, name and slug', (report) => {
    const input = mount();
    fireEvent.change(input, { target: { value: report.pos + ' ' + report.name } });
    expect(
      screen
        .getAllByRole('option')
        .some((o) => o.textContent?.includes(report.pos + ' ' + report.name)),
    ).toBe(true);
    fireEvent.change(input, { target: { value: report.id } });
    expect(
      screen
        .getAllByRole('option')
        .some((o) => o.textContent?.includes(report.pos + ' ' + report.name)),
    ).toBe(true);
  });
  it('finds fuzzy page names', () => {
    const input = mount();
    fireEvent.change(input, { target: { value: 'vrmgn prtf' } });
    expect(screen.getByRole('option', { name: /Vermögen · Portfolio/ })).toBeTruthy();
  });
  it('finds the named default register as a page, including German umlauts', () => {
    const input = mount();
    fireEvent.change(input, { target: { value: 'Nettovermögen' } });
    const page = screen.getByRole('option', { name: /Vermögen · Nettovermögen/ });
    expect(page.querySelector('.global-search-kind')?.textContent).toBe('Seite');
  });
  it('keeps server matches on memo and amount even when the payee label differs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              results: [
                {
                  kind: 'booking',
                  id: 'synthetic-booking',
                  label: 'Musterladen',
                  detail: 'Notiz · −123,45 EUR',
                },
              ],
            }),
          ),
      ),
    );
    const input = mount();
    fireEvent.change(input, { target: { value: '123,45' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Musterladen/ })).toBeTruthy());
  });
  it('opens shortcut help with ? outside typing and closes it with Escape', async () => {
    const input = mount();
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog', { name: 'Tastenkürzel' })).toBeNull();
    fireEvent.keyDown(window, { key: '?' });
    const dialog = await screen.findByRole('dialog', { name: 'Tastenkürzel' });
    expect(dialog.textContent).toContain('Enter weiter');
    expect(dialog.textContent).toContain('Violett');
    expect(dialog.querySelector<HTMLElement>('.panel-body')?.tabIndex).toBe(0);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tastenkürzel' })).toBeNull());
  });
  it('returns focus to the connected search help button after Escape', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Tastenkürzel anzeigen (?)' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Tastenkürzel' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
  it('closes the desktop palette from its help button with Escape and returns to search', () => {
    const input = mount();
    const trigger = screen.getByRole('button', { name: 'Tastenkürzel anzeigen (?)' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
  });
  it('reopens on the first recent choice after arrow-key selection', () => {
    const input = mount();
    fireEvent.change(input, { target: { value: 'Neue Buchung' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const selected = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true')!;
    const label = selected.textContent;
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.focus(input);
    const first = screen.getAllByRole('option')[0]!;
    expect(first.textContent).toBe(label);
    expect(first.getAttribute('aria-selected')).toBe('true');
  });
  it('hides cached entity choices while the server revalidates a reopened search', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              { kind: 'account', id: 'synthetic-account', label: 'Musterkonto', detail: null },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const input = mount();
    fireEvent.change(input, { target: { value: 'Musterkonto' } });
    await screen.findByRole('option', { name: /Musterkonto/ });
    fireEvent.keyDown(input, { key: 'Escape' });
    let release: ((response: Response) => void) | undefined;
    fetcher.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    fireEvent.focus(input);
    try {
      await waitFor(() => expect(release).toBeDefined());
      expect(screen.queryByRole('option', { name: /Musterkonto/ })).toBeNull();
    } finally {
      release?.(new Response(JSON.stringify({ results: [] })));
    }
  });
  it('sends recently selected entity IDs with a nonempty query for ranking before server limits', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              { kind: 'account', id: 'synthetic-recent', label: 'Musterkonto', detail: null },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const input = mount();
    fireEvent.change(input, { target: { value: 'Musterkonto' } });
    fireEvent.click(await screen.findByRole('option', { name: /Musterkonto/ }));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Muster' } });
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url]) => String(url).includes('q=Muster&'));
      expect(call).toBeDefined();
      const url = new URL(String(call![0]), 'http://localhost');
      expect(JSON.parse(url.searchParams.get('recent')!)).toContainEqual({
        kind: 'account',
        id: 'synthetic-recent',
      });
    });
  });
  it('opens existing capture and inbox flows, toggles privacy and puts recent choices first', async () => {
    const input = mount();
    for (const [label, panel] of [
      ['Neue Buchung', 'buchung'],
      ['Posteingang öffnen', 'posteingang'],
    ]) {
      fireEvent.change(input, { target: { value: label } });
      await waitFor(() =>
        expect(screen.getByRole('option', { name: new RegExp(label!) })).toBeTruthy(),
      );
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: '.', search: expect.any(Function) }),
      );
      const call = navigate.mock.calls.at(-1)![0];
      expect(call.search({ monat: '2026-09' })).toEqual({ monat: '2026-09', panel });
      fireEvent.focus(input);
      expect(screen.getAllByRole('option')[0]?.textContent).toContain(label);
    }
    fireEvent.change(input, { target: { value: 'Datenschutz-Modus umschalten' } });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Datenschutz-Modus umschalten/ })).toBeTruthy(),
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(amountsHidden()).toBe(true);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
