// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PlanAutomatic } from './plan-automatic';
import { PlanAssignmentPreview, selectedAssignmentPreview } from './plan-assignment-preview';
import { EnvelopeBody } from './envelope-panel';
import { PlanInspector } from './plan-inspector';
import type { PlanRow } from './plan-model';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#detail">{children}</a>,
}));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});
const row = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'a',
  categoryId: 'a',
  name: 'Synthetic category',
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'g',
  cardAccountId: null,
  carryCents: 0,
  assignedCents: 400,
  activityCents: 0,
  availableCents: 400,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  quickAssign: {
    lastMonthCents: 1000,
    averageCents: 300,
    ghostCents: 0,
    ghostSource: 'median',
    historyMonths: [],
  },
  ...over,
});

const target = {
  id: 'target',
  categoryId: 'a',
  kind: 'monthly' as const,
  amountCents: 1000,
  everyMonths: 1,
  targetDate: null,
  dueDay: null,
  validFrom: '2026-10',
};

it('514 previews selected targets in the existing supplied order with full target funding beyond available money', () => {
  const selected = [
    row({ id: 'later-stage', categoryId: 'later-stage', stage: 8, needCents: 600, target }),
    row({
      id: 'first-stage',
      categoryId: 'first-stage',
      stage: 1,
      assignedCents: 0,
      needCents: 200,
      target,
    }),
  ];
  const original = structuredClone(selected);
  const preview = selectedAssignmentPreview(selected, 'target', 500);
  expect(preview.deltaCents).toBe(800);
  expect(preview.missingCents).toBe(0);
  expect(
    preview.rows.map(({ afterCents, deltaCents, missingCents }) => [
      afterCents,
      deltaCents,
      missingCents,
    ]),
  ).toEqual([
    [1000, 600, 0],
    [200, 200, 0],
  ]);
  expect(selected).toEqual(original);
  expect(selectedAssignmentPreview(selected, 'target', -100).deltaCents).toBe(800);
});

it('514 exposes exclusions and still includes legacy assignments in a capped reset', () => {
  const legacy = row({ target, assignedCents: -500 });
  delete legacy.quickAssign;
  const selected = [
    legacy,
    row({ id: 'no-target', categoryId: 'no-target', assignedCents: 0 }),
    row({ id: 'card', categoryId: 'card', kind: 'card_payment', cls: null, assignedCents: 1000 }),
    row({ id: 'advance', categoryId: 'advance', kind: 'advance', cls: null, assignedCents: 1000 }),
  ];
  expect(
    selectedAssignmentPreview(selected, 'target', 200).rows.map(({ reason }) => reason),
  ).toEqual([
    'Zuweisungsdaten nicht verfügbar',
    'Kein Ziel',
    'Kartenreserve – keine automatische Zuweisung',
    'Keine Ausgabenkategorie',
  ]);
  const preview = selectedAssignmentPreview(selected, 'reset', 200);
  expect(preview).toMatchObject({ deltaCents: 200, missingCents: 300 });
  expect(preview.rows[0]).toMatchObject({
    afterCents: -300,
    deltaCents: 200,
    missingCents: 300,
    reason: null,
  });
  expect(preview.rows[2]).toMatchObject({ afterCents: 1000, deltaCents: 0, missingCents: null });
});

it('514 shows both offsetting reset changes even when their total is zero', () => {
  const preview = selectedAssignmentPreview(
    [
      row({ assignedCents: 500 }),
      row({ id: 'negative', categoryId: 'negative', assignedCents: -500 }),
    ],
    'reset',
    0,
  );
  expect(preview).toMatchObject({ deltaCents: 0, missingCents: 0, changedCount: 2 });
  expect(preview.rows.map(({ afterCents, deltaCents }) => [afterCents, deltaCents])).toEqual([
    [0, -500],
    [0, 500],
  ]);
});

it('514 disclosure, mode changes and live privacy stay read-only', () => {
  const calls = setup(
    <PlanAssignmentPreview month="2026-10" rows={[row({ target, needCents: 600 })]} tba={200} />,
  );
  fireEvent.click(screen.getByText('Zuweisungsvorschau', { selector: 'summary' }));
  const preview = screen.getByRole('region', { name: 'Zuweisungsvorschau' });
  const category = within(preview).getByRole('group', { name: 'Synthetic category' });
  expect(
    within(category)
      .getAllByRole('definition')
      .map((cell) => cell.textContent),
  ).toEqual(['4,00 €', '6,00 €', '+6,00 €', '10,00 €', '0,00 €']);
  fireEvent.change(screen.getByLabelText('Vorschau für'), { target: { value: 'reset' } });
  expect(
    within(category)
      .getAllByRole('definition')
      .map((cell) => cell.textContent),
  ).toEqual(['4,00 €', '−4,00 €', '0,00 €', '0,00 €']);
  act(() => setAmountsHidden(true));
  expect(
    within(preview)
      .getAllByRole('definition')
      .every((cell) => cell.textContent === '••• €'),
  ).toBe(true);
  expect(within(preview).queryByRole('button')).toBeNull();
  expect(calls).toEqual([]);
});

it.each([false, true])(
  '514 disables preview for an empty selection or multiple months (%s)',
  (disabled) => {
    const calls = setup(
      <PlanAssignmentPreview
        month="2026-10"
        rows={disabled ? [row()] : []}
        tba={200}
        disabled={disabled}
      />,
    );
    fireEvent.click(screen.getByText('Zuweisungsvorschau', { selector: 'summary' }));
    expect(screen.getByLabelText('Vorschau für').hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText(disabled ? 'Nur bei einem Monat' : 'Bitte Kategorien auswählen.'),
    ).toBeTruthy();
    expect(calls).toEqual([]);
  },
);

it('514 recalculates a read-only preview when current funds or target need change', () => {
  const selected = row({ target, needCents: 600 });
  const view = render(<PlanAssignmentPreview month="2026-10" rows={[selected]} tba={200} />);
  fireEvent.click(screen.getByText('Zuweisungsvorschau', { selector: 'summary' }));
  view.rerender(<PlanAssignmentPreview month="2026-10" rows={[selected]} tba={0} />);
  expect(screen.getByRole('status').textContent).toContain('−6,00 €');
  view.rerender(
    <PlanAssignmentPreview month="2026-10" rows={[{ ...selected, needCents: 0 }]} tba={200} />,
  );
  expect(screen.getByText('Keine Zuweisung erforderlich.')).toBeTruthy();
  const unavailable = { ...selected };
  delete unavailable.quickAssign;
  view.rerender(<PlanAssignmentPreview month="2026-10" rows={[unavailable]} tba={200} />);
  expect(screen.getByText('Keine vollständige Zuweisungsvorschau verfügbar.')).toBeTruthy();
  expect(screen.queryByText('Keine Zuweisung erforderlich.')).toBeNull();
});
function setup(ui: ReactNode, changedCount = 1) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(
        JSON.stringify({
          groupId: path === '/api/undo' ? 'undone' : 'one-group',
          changedCount,
          missingCents: 0,
          openCount: 0,
          coveredCents: 200,
        }),
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}
it('renders the five signed previews, disables zero and sends only supplied selection IDs through the existing call/Undo', async () => {
  const selected = row();
  const calls = setup(<PlanAutomatic month="2026-10" rows={[selected]} tba={200} />);
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Wie letzter Monat +2,00 €' }).textContent).toContain(
    '+2,00 €',
  );
  expect(screen.getByText(/fehlen für 1 Kategorie/).textContent).toContain('4,00 €');
  expect(screen.getByRole('button', { name: 'Leere füllen 0,00 €' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Auf 0 zurücksetzen −4,00 €' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Wie letzter Monat +2,00 €' }));
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'last-month', categoryIds: ['a'] },
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
  act(() => setAmountsHidden(true));
  expect(screen.getByRole('button', { name: /^Auf 0 zurücksetzen/ }).textContent).not.toContain(
    '4,00',
  );
});
it('offsetting reset stays enabled at net zero, sends both assignments and offers one Undo', async () => {
  const positive = row({ assignedCents: 500 });
  const negative = row({ id: 'negative', categoryId: 'negative', assignedCents: -500 });
  const calls = setup(<PlanAutomatic month="2026-10" rows={[positive, negative]} tba={0} />, 2);
  const reset = screen.getByRole('button', { name: 'Auf 0 zurücksetzen 0,00 €' });
  expect(reset.textContent).toBe('Auf 0 zurücksetzen 0,00 €');
  expect(reset.hasAttribute('disabled')).toBe(false);
  fireEvent.click(reset);
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'reset', categoryIds: ['a', 'negative'] },
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
});
it('a single suggested cover uses only 200 free cents, preserves the 300-cent shortfall and one Undo', async () => {
  const target = row({
    id: 'target',
    categoryId: 'target',
    assignedCents: 0,
    availableCents: -500,
    activityCents: -500,
    overspentCents: 500,
    cashOverspentCents: 500,
  });
  const source = row({
    id: 'source',
    categoryId: 'source',
    name: 'Synthetic source',
    availableCents: 9500,
    committedCents: 9300,
    freeCents: 200,
  });
  const calls = setup(
    <EnvelopeBody
      month="2026-10"
      row={target}
      rows={[target, source]}
      tba={0}
      onDone={() => {}}
      compact
    />,
  );
  expect(screen.getByText('Aus Synthetic source')).toBeTruthy();
  expect(screen.getAllByText(/3,00 € bleiben offen/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Mit 2,00 € decken' }));
  await waitFor(() =>
    expect(calls).toEqual([
      { path: '/api/budget/2026-10/cover', body: { categoryId: 'target', fromId: 'source' } },
    ]),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(calls).toContainEqual({ path: '/api/undo', body: { groupId: 'one-group' } }),
  );
});
it('reset includes a classed legacy row without history, excluding classless advance rows from the API scope', async () => {
  const legacy = row({ assignedCents: 1200 });
  delete legacy.quickAssign;
  const advance = row({
    id: 'advance',
    categoryId: 'advance',
    kind: 'advance',
    cls: null,
    assignedCents: 500,
  });
  const calls = setup(<PlanAutomatic month="2026-10" rows={[legacy, advance]} tba={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Auf 0 zurücksetzen −12,00 €' }));
  await waitFor(() =>
    expect(calls).toContainEqual({
      path: '/api/budget/2026-10/quick-assign',
      body: { mode: 'reset', categoryIds: ['a'] },
    }),
  );
});
it.each([false, true])(
  'below 1180 focuses the actual heading and respects reduced-motion=%s',
  (reduced) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query === '(max-width: 1179px)' ||
        (reduced && query === '(prefers-reduced-motion: reduce)'),
    }));
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const selected = row();
      setup(
        <PlanInspector
          month="2026-10"
          rows={[selected]}
          visibleRows={[selected]}
          selected={[selected]}
          tba={200}
          category={undefined}
          onCategory={() => {}}
          onHide={() => {}}
          onClear={() => {}}
          overview={null}
          split={null}
          income={null}
          money={null}
          rail={null}
        />,
      );
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Synthetic category' }),
      );
      expect(scroll).toHaveBeenCalledWith({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  },
);

it('450 keeps class and pace only in the focused category heading tooltip and reacts to amount privacy', () => {
  const selected = row({ activityCents: -100, availableCents: 300 });
  setup(
    <PlanInspector
      month="2026-09"
      rows={[selected]}
      visibleRows={[selected]}
      selected={[selected]}
      tba={200}
      category={undefined}
      onCategory={() => {}}
      onHide={() => {}}
      onClear={() => {}}
      overview={null}
      split={null}
      income={null}
      money={null}
      rail={null}
      focusSelection={false}
    />,
  );
  const heading = screen.getByRole('heading', { name: 'Synthetic category' });
  expect(heading.getAttribute('title')).toBe('Bedarf · Tempo: 1,00 € von 4,00 € ausgegeben');
  expect(screen.queryByText('Bedarf · Tempo: 1,00 € von 4,00 € ausgegeben')).toBeNull();
  expect(heading.getAttribute('tabindex')).toBe('-1');
  act(() => setAmountsHidden(true));
  expect(heading.getAttribute('title')).toBe('Bedarf · Tempo: ••• € von ••• € ausgegeben');
  act(() => setAmountsHidden(false));
  expect(heading.getAttribute('title')).toBe('Bedarf · Tempo: 1,00 € von 4,00 € ausgegeben');
});
