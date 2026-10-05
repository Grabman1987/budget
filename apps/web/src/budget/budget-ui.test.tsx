// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryRow, CategoryTree } from './api';
import { CategoriesPage } from './categories-page';
import { CategoryPanel } from './category-panel';
import { EnvelopePanel } from './envelope-panel';
import type { PlanRow } from './plan-model';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#k">{children}</a>,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

type Answer = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
interface Call {
  key: string;
  body: unknown;
}

/** Answers API calls per "METHOD path" (query string ignored); records every call with its body. */
function stubApi(routes: Record<string, (body: unknown) => Answer>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const route = routes[key] ?? routes[key.replace(/\/[^/]+$/, '/*')];
      const answer = route ? await route(body) : { status: 404, body: { error: 'not_found' } };
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return (key: string) => calls.filter((c) => c.key === key).map((c) => c.body);
}
const ok = (body: unknown = { groupId: 'grp' }) => ({ status: 200, body });

function renderWith(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // jsdom has no showModal and no matchMedia (desktop layout).
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = () =>
  screen
    .getAllByRole('status')
    .map((s) => s.textContent)
    .join(' ');

const envelope = (over: Partial<PlanRow> = {}): PlanRow => ({
  categoryId: 'essen',
  id: 'essen',
  name: 'Lebensmittel',
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'g',
  cardAccountId: null,
  carryCents: 0,
  assignedCents: 0,
  activityCents: -5_000,
  availableCents: -5_000,
  overspentCents: 5_000,
  cashOverspentCents: 5_000,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  ...over,
});

function renderEnvelope(row: PlanRow, tba: number, onClose = vi.fn(), month = '2026-09') {
  renderWith(
    <EnvelopePanel
      month={month}
      row={row}
      rows={[row]}
      toBeAssignedCents={tba}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe('Envelope panel: Decken from Zu verteilen', () => {
  it.each(['2025-12', '2026-09', '2027-01'])(
    'covers the selected month %s without a current-month gate',
    async (month) => {
      const calls = stubApi({
        [`POST /api/budget/${month}/cover`]: () => ok({ groupId: 'grp', coveredCents: 5_000 }),
      });
      renderEnvelope(envelope(), 10_000, vi.fn(), month);
      await userEvent.click(screen.getByRole('button', { name: 'Decken · 50,00 €' }));
      await waitFor(() =>
        expect(calls(`POST /api/budget/${month}/cover`)).toEqual([
          { categoryId: 'essen', fromId: null },
        ]),
      );
    },
  );

  it('offers "Nur x decken" by default when Zu verteilen is short, capped by the server', async () => {
    const calls = stubApi({
      'POST /api/budget/2026-09/cover': () => ok({ groupId: 'grp', coveredCents: 2_000 }),
    });
    renderEnvelope(envelope(), 2_000);
    await userEvent.selectOptions(screen.getByLabelText('Aus'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Decken · 50,00 €' }));
    expect(calls('POST /api/budget/2026-09/cover')).toEqual([]);
    const choice = screen.getByRole('group', { name: 'Decken aus Zu verteilen' });
    await userEvent.click(within(choice).getByRole('button', { name: 'Nur 20,00 € decken' }));
    await waitFor(() =>
      expect(calls('POST /api/budget/2026-09/cover')).toEqual([
        { categoryId: 'essen', fromId: null },
      ]),
    );
    await waitFor(() => expect(status()).toContain('30,00 € bleiben offen'));
  });

  it('only offers the explicit confirmation when Zu verteilen holds nothing', async () => {
    const calls = stubApi({
      'POST /api/budget/2026-09/cover': () => ok({ groupId: 'grp', coveredCents: 5_000 }),
    });
    renderEnvelope(envelope(), 0);
    await userEvent.selectOptions(screen.getByLabelText('Aus'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Decken · 50,00 €' }));
    const choice = screen.getByRole('group', { name: 'Decken aus Zu verteilen' });
    expect(within(choice).queryByRole('button', { name: /^Nur/ })).toBeNull();
    await userEvent.click(
      within(choice).getByRole('button', {
        name: 'Trotzdem ganz decken (Zu verteilen wird negativ)',
      }),
    );
    await waitFor(() =>
      expect(calls('POST /api/budget/2026-09/cover')).toEqual([
        { categoryId: 'essen', fromId: null, allowNegative: true },
      ]),
    );
  });

  it('covers at once when Zu verteilen is enough, and shows a refusal as a toast', async () => {
    const calls = stubApi({
      'POST /api/budget/2026-09/cover': () => ({
        status: 422,
        body: { error: 'category_rule', message: '„Zu verteilen“ reicht nicht zum Decken.' },
      }),
    });
    const onClose = renderEnvelope(envelope(), 10_000);
    await userEvent.click(screen.getByRole('button', { name: 'Decken · 50,00 €' }));
    await waitFor(() => expect(calls('POST /api/budget/2026-09/cover')).toHaveLength(1));
    await waitFor(() => expect(status()).toContain('„Zu verteilen“ reicht nicht zum Decken.'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a negative assignment as it is instead of reading it as a change', async () => {
    const calls = stubApi({ 'PUT /api/budget/2026-09/assigned': () => ok() });
    const row = envelope({ assignedCents: -5_000, overspentCents: 0, cashOverspentCents: 0 });
    const onClose = renderEnvelope(row, 0);
    expect((screen.getByLabelText('Zugewiesen') as HTMLInputElement).value).toBe('−50,00');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(onClose).toHaveBeenCalled();
    expect(calls('PUT /api/budget/2026-09/assigned')).toEqual([]);
  });
});

const cat = (id: string, over: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  name: id,
  icon: null,
  groupId: 'g1',
  class: 'need',
  kind: 'variable',
  stage: null,
  cardAccountId: null,
  rolloverOverspending: false,
  sortOrder: 0,
  hiddenAt: null,
  splitCount: 0,
  ...over,
});
const tree = (categories: CategoryRow[]): CategoryTree => ({
  groups: [
    { id: 'g1', name: 'Alltag', sortOrder: 0 },
    { id: 'g2', name: 'Freizeit', sortOrder: 1 },
  ],
  categories: categories.map((c, i) => ({ ...c, sortOrder: i })),
  targets: [],
});

describe('Category panel', () => {
  it('shows kind and card of a card payment read-only and shows a refusal as a toast', async () => {
    const card = cat('karte', {
      name: 'Kartenzahlung',
      kind: 'card_payment',
      class: null,
      cardAccountId: 'acc',
    });
    const calls = stubApi({
      'GET /api/accounts': () =>
        ok({ accounts: [{ id: 'acc', name: 'Visa', type: 'credit_card', closedAt: null }] }),
      'PATCH /api/categories/karte': () => ({
        status: 422,
        body: {
          error: 'category_rule',
          message: 'Die Art einer Kartenzahlung lässt sich nicht ändern.',
        },
      }),
    });
    const onClose = vi.fn();
    renderWith(
      <CategoryPanel
        state={{ mode: 'edit', groupId: 'g1', category: card }}
        tree={tree([card])}
        onClose={onClose}
        onSwitch={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Art')).toBeNull();
    expect(screen.queryByLabelText('Kreditkarte')).toBeNull();
    expect(screen.getByText(/Art und Karte lassen sich nicht ändern/)).toBeTruthy();
    expect(await screen.findByText('Visa')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(calls('PATCH /api/categories/karte')).toHaveLength(1));
    const patch = calls('PATCH /api/categories/karte')[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('kind');
    expect(patch).not.toHaveProperty('cardAccountId');
    await waitFor(() => expect(status()).toContain('Die Art einer Kartenzahlung'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('merges never into income or card payments, warns about a hidden target and overspending', async () => {
    const cafe = cat('cafe', { name: 'Café', class: 'want' });
    const categories = [
      cafe,
      cat('lohn', { name: 'Gehalt', kind: 'income', class: null }),
      cat('karte', { name: 'Kartenzahlung', kind: 'card_payment', class: null }),
      cat('alt', { name: 'Alt', hiddenAt: '2026-01-01T00:00:00Z' }),
      cat('essen', { name: 'Lebensmittel' }),
    ];
    stubApi({
      'GET /api/budget/*': () =>
        ok({
          summary: { envelopes: [{ categoryId: 'cafe', overspentCents: 1_240 }] },
          groups: [],
          categories: [],
        }),
    });
    renderWith(
      <CategoryPanel
        state={{ mode: 'merge', category: cafe }}
        tree={tree(categories)}
        onClose={vi.fn()}
        onSwitch={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('Zusammenführen in') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Alt (ausgeblendet)',
      'Lebensmittel',
    ]);
    expect(screen.getByText(/ist ausgeblendet und bleibt es/)).toBeTruthy();
    expect(await screen.findByText(/um 12,40 € überzogen/)).toBeTruthy();
    await userEvent.selectOptions(select, 'essen');
    expect(screen.queryByText(/ist ausgeblendet und bleibt es/)).toBeNull();
  });
});

describe('Categories page: sorting', () => {
  const list = [cat('a', { name: 'A' }), cat('b', { name: 'B' }), cat('c', { name: 'C' })];
  const ids = (body: unknown) =>
    (body as { groups: Array<{ categoryIds: string[] }> }).groups.map((g) => g.categoryIds);

  it('builds a second ↑ on the first one, one write (and undo) per move, in order', async () => {
    let release: () => void = () => {};
    const first = new Promise<void>((r) => (release = r));
    let releaseSecond: () => void = () => {};
    const second = new Promise<void>((r) => (releaseSecond = r));
    let n = 0;
    const calls = stubApi({
      'GET /api/categories': () => ok(tree(list)),
      'POST /api/categories/sort': async () => {
        if (n++ === 0) await first;
        else await second;
        return ok();
      },
    });
    renderWith(<CategoriesPage />);
    const handle = await screen.findByRole('button', { name: 'C verschieben' });
    handle.focus();
    await userEvent.keyboard('{ArrowUp}');
    // The row moved: focus stays on its handle, and the next press uses the new order.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('C verschieben');
    await userEvent.keyboard('{ArrowUp}');
    release();
    await waitFor(() => {
      expect(status()).toContain('Reihenfolge gespeichert.');
      expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
    });
    const firstSuccess = screen.getByText('Reihenfolge gespeichert.');
    await waitFor(() => expect(calls('POST /api/categories/sort')).toHaveLength(2));
    expect(calls('POST /api/categories/sort').map(ids)).toEqual([
      [['a', 'c', 'b'], []],
      [['c', 'a', 'b'], []],
    ]);
    releaseSecond();
    await waitFor(() => {
      expect(firstSuccess.isConnected).toBe(false);
      expect(status()).toContain('Reihenfolge gespeichert.');
      expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
    });
  });

  it('moves with the phone buttons, across the group border too', async () => {
    const calls = stubApi({
      'GET /api/categories': () => ok(tree(list)),
      'POST /api/categories/sort': () => ok(),
    });
    renderWith(<CategoriesPage />);
    expect(
      ((await screen.findByRole('button', { name: 'A nach oben' })) as HTMLButtonElement).disabled,
    ).toBe(true);
    // C is the last of Alltag: ↓ takes it to the start of the (empty) next group.
    await userEvent.click(screen.getByRole('button', { name: 'C nach unten' }));
    await waitFor(() => expect(status()).toContain('Reihenfolge gespeichert.'));
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'A nach unten' }));
    await waitFor(() => expect(calls('POST /api/categories/sort')).toHaveLength(2));
    expect(calls('POST /api/categories/sort').map(ids)).toEqual([
      [['a', 'b'], ['c']],
      [['b', 'a', 'c'], []],
    ]);
  });
});

it('cover label shows the source rest and replaces a depleted source', async () => {
  const target = envelope({
    overspentCents: 1240,
    cashOverspentCents: 1240,
    availableCents: -1240,
  });
  const source = envelope({
    id: 'free',
    categoryId: 'free',
    name: 'Freizeit',
    availableCents: 2480,
    overspentCents: 0,
    cashOverspentCents: 0,
  });
  const second = {
    ...source,
    id: 'reserve',
    categoryId: 'reserve',
    name: 'Rücklage',
    availableCents: 2000,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (rows: PlanRow[], tba = 0) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <EnvelopePanel
          month="2026-09"
          row={target}
          rows={rows}
          toBeAssignedCents={tba}
          onClose={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  const view = render(ui([target, source, second]));
  expect(screen.getByTestId('cover-remaining').textContent).toBe('aus Freizeit · bleibt 12,40 €');
  view.rerender(ui([target, { ...source, availableCents: 0 }, second]));
  expect(screen.getByTestId('cover-remaining').textContent).toBe('aus Rücklage · bleibt 7,60 €');
  expect(screen.queryByRole('option', { name: /Freizeit/ })).toBeNull();
  view.rerender(ui([target, source, second], 5000));
  await userEvent.selectOptions(screen.getByLabelText('Aus'), '');
  expect(screen.getByTestId('cover-remaining').textContent).toBe(
    'aus Zu verteilen · bleibt 37,60 €',
  );
  view.rerender(ui([target, source, second], 0));
  expect(screen.getByTestId('cover-remaining').textContent).toBe('aus Freizeit · bleibt 12,40 €');
});
