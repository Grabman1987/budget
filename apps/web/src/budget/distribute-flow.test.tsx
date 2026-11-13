// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DistributeFlow } from './distribute-flow';
import { validatePlanFilterSearch } from './plan-filters';
import { planHistory } from './plan-history';
import { ApiError } from '../api/http';
import type { BudgetMonthView, EnvelopeSummary } from './budget-api';

/** #1055: guided "Geld verteilen" with synthetic figures; amounts are literal expectations. */

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    children,
    to,
    className,
  }: {
    children: ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const envelope = (id: string, values: Partial<EnvelopeSummary>): EnvelopeSummary => ({
  categoryId: id,
  carryCents: 0,
  assignedCents: 0,
  activityCents: 0,
  availableCents: 0,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  ...values,
});

const CATEGORIES = [
  ['fun', 7, 'variable'],
  ['rent', 1, 'variable'],
  ['food', 2, 'variable'],
  ['card', 1, 'card_payment'],
  ['spare', 8, 'variable'],
] as const;

function view(summary: Partial<BudgetMonthView['summary']>, extra: EnvelopeSummary[] = []) {
  const replaced = new Set(extra.map((e) => e.categoryId));
  const envelopes = [
    ...[
      envelope('fun', { needCents: 5_000 }),
      envelope('rent', { needCents: 80_000 }),
      envelope('food', {
        assignedCents: 10_000,
        activityCents: -12_340,
        availableCents: -2_340,
        overspentCents: 2_340,
        cashOverspentCents: 2_340,
        needCents: 12_550,
      }),
      envelope('card', { needCents: 9_900 }),
      envelope('spare', { assignedCents: 20_000, availableCents: 20_000, freeCents: 15_000 }),
    ].filter((e) => !replaced.has(e.categoryId)),
    ...extra,
  ];
  return {
    previewBasis: 'synthetic-basis',
    groups: [{ id: 'g', name: 'Synthetic group', sortOrder: 0 }],
    categories: CATEGORIES.map(([id, stage, kind], sortOrder) => ({
      id,
      name: `Synthetic ${id}`,
      icon: null,
      groupId: 'g',
      class: 'need' as const,
      kind,
      stage,
      cardAccountId: null,
      rolloverOverspending: false,
      sortOrder,
      hiddenAt: null,
      splitCount: 0,
    })),
    summary: {
      month: '2026-10',
      carryInCents: 50_000,
      incomeCents: 250_000,
      uncoveredCents: 1_500,
      heldCents: 0,
      assignedCents: 200_000,
      activityCents: -12_340,
      availableCents: 0,
      toBeAssignedCents: 98_500,
      creditOverspentCents: 0,
      cashOverspentCents: 2_340,
      envelopes,
      cards: [],
      ...summary,
    },
  } as BudgetMonthView;
}

const income = {
  month: '2026-10',
  receivedCents: 240_000,
  expectedCents: 260_000,
  byIncomeType: [],
  byPayment: [],
};

let client: QueryClient;
let assign: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;
let posts: Array<{ path: string; body: unknown }>;
let undoAnswer: () => Response;
let coverAnswer: () => Response;
let readView: BudgetMonthView | null;
beforeEach(() => {
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  assign = vi.fn(async () => ({ groupId: 'synthetic-group' }));
  onClose = vi.fn();
  posts = [];
  undoAnswer = () => Response.json({ groupId: 'synthetic-undo' });
  coverAnswer = () =>
    Response.json({ groupId: 'synthetic-move', coveredCount: 2, openCount: 0, missingCents: 0 });
  readView = null;
  // Existing write endpoints (move, cover-all, undo); reads are not needed by the flow itself.
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if ((init?.method ?? 'GET') === 'GET')
      return Response.json(path === '/api/budget/2026-10' && readView ? readView : {});
    posts.push({ path, body: JSON.parse(String(init?.body ?? 'null')) });
    if (path === '/api/undo') return undoAnswer();
    if (path === '/api/budget/2026-10/move') return coverAnswer();
    return Response.json({ error: 'unexpected_test_request' }, { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

/** A reload keeps sessionStorage and never runs React cleanups; an in-app unmount does. */
function reload(render: () => void) {
  const stored = { ...sessionStorage };
  cleanup();
  for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  render();
}

function flow(data: BudgetMonthView) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DistributeFlow
          month="2026-10"
          data={data}
          monthIncome={income}
          assign={assign as never}
          onIncome={() => {}}
          onClose={onClose as never}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Weiter:/ }));
const stepTitle = () => screen.getByRole('heading', { level: 3 }).textContent;

it('step 1 shows received income, expected income apart and the uncovered carry-over', () => {
  render(flow(view({})));
  const stepper = screen.getByRole('navigation', { name: 'Geld verteilen' });
  expect(within(stepper).getAllByRole('listitem')).toHaveLength(4);
  expect(within(stepper).getByRole('button', { name: /1\. Eingang prüfen/ })).toHaveProperty(
    'ariaCurrent',
    'step',
  );
  expect(stepTitle()).toBe('1. Eingang prüfen');
  expect(screen.getByTestId('distribute-tba').textContent).toBe('985,00 €');
  expect(screen.getByTestId('distribute-income').textContent).toBe('2.500,00 €');
  expect(screen.getByTestId('distribute-expected').textContent).toBe(
    'erhalten 2.400,00 € von erwartet 2.600,00 €',
  );
  expect(screen.getByTestId('distribute-uncovered').textContent).toBe('15,00 €');
  expect(screen.getByText(/nie als verfügbares Geld verteilt/)).toBeTruthy();
  // Two income figures, each labelled with its basis.
  expect(screen.getByText('Gebuchte Einnahmen im Budgetmonat')).toBeTruthy();
  expect(screen.getByText('Erwartete Zahlungen (Einnahmen-Übersicht)')).toBeTruthy();
});

it('step 2 orders overspent and underfunded envelopes by waterfall with amounts needed', () => {
  render(flow(view({})));
  next();
  expect(stepTitle()).toBe('2. Lücken');
  const over = screen.getByTestId('distribute-overspent');
  expect(within(over).getByRole('heading').textContent).toBe('Überzogen · 23,40 €');
  expect(
    within(over)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Synthetic foodÜberzogenfehlt 23,40 €']);
  const under = screen.getByTestId('distribute-underfunded');
  expect(within(under).getByRole('heading').textContent).toBe('Unterfinanziert · 975,50 €');
  expect(
    within(under)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual([
    'Synthetic rentStufe 1 · Fixkostenfehlt 800,00 €',
    'Synthetic foodStufe 2 · Laufendfehlt 125,50 €',
    'Synthetic funStufe 7 · Sparzielefehlt 50,00 €',
  ]);
});

it('step 3 assigns per category and "alle nach Plan" through the existing assignment call', async () => {
  render(flow(view({})));
  next();
  next();
  expect(stepTitle()).toBe('3. Zuweisen');
  expect(screen.getByTestId('distribute-left').textContent).toBe(
    'Danach bleiben 9,50 € ohne Ziel in „Zu verteilen“.',
  );
  fireEvent.click(screen.getByRole('button', { name: '800,00 € an Synthetic rent zuweisen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'rent', assignedCents: 80_000 }]);
  // The existing budget toast announces the audited write (role=status).
  expect(await screen.findByText('Synthetic rent: 800,00 € zugewiesen')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Alle nach Plan zuweisen · 975,50 €' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
  expect(assign).toHaveBeenLastCalledWith([
    { categoryId: 'rent', assignedCents: 80_000 },
    { categoryId: 'food', assignedCents: 22_550 },
    { categoryId: 'fun', assignedCents: 5_000 },
  ]);
  // The existing audited undo is offered in the flow.
  expect(await screen.findByRole('button', { name: 'Letzte Änderung rückgängig' })).toBeTruthy();
});

it('a failed assignment keeps the error visible and stays retryable', async () => {
  assign.mockRejectedValueOnce(new Error('synthetic offline'));
  render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '50,00 € an Synthetic fun zuweisen' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/^Synthetic fun: 50,00 € zugewiesen – fehlgeschlagen\./);
  fireEvent.click(within(alert).getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'fun', assignedCents: 5_000 }]);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('when over-assigned it guides taking money back from free balances only', async () => {
  render(flow(view({ toBeAssignedCents: -12_000 })));
  expect(screen.getByTestId('distribute-tba').textContent).toBe('−120,00 €');
  expect(screen.getByText('Zu viel zugewiesen · Zu verteilen')).toBeTruthy();
  next();
  next();
  const list = screen.getByTestId('distribute-takeback');
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Synthetic sparefrei 150,00 €120,00 € zurücknehmen']);
  fireEvent.click(within(list).getByRole('button', { name: '120,00 € zurücknehmen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'spare', assignedCents: 8_000 }]);
  cleanup();
  sessionStorage.clear();
  render(flow(view({ toBeAssignedCents: -20_000 })));
  next();
  next();
  expect(screen.getByTestId('distribute-missing').textContent).toMatch(
    /^Freies Guthaben reicht nicht: es fehlen weiterhin 50,00 €\./,
  );
});

it("step 4 counts only this flow's writes and shows outside changes apart; resumes", async () => {
  const { rerender } = render(flow(view({})));
  for (let i = 0; i < 2; i += 1) next();
  fireEvent.click(screen.getByRole('button', { name: '800,00 € an Synthetic rent zuweisen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  next();
  expect(stepTitle()).toBe('4. Rest und Zusammenfassung');
  // The read model after rent (+800,00 €) and +150,00 € assigned in another tab.
  rerender(
    flow(
      view({ assignedCents: 295_000, toBeAssignedCents: 3_500 }, [
        envelope('rent', { assignedCents: 80_000, availableCents: 80_000 }),
      ]),
    ),
  );
  const rows = () =>
    [...screen.getByTestId('distribute-summary').querySelectorAll('div')].map((d) => d.textContent);
  expect(rows()).toEqual([
    'In diesem Durchgang zugewiesen800,00 €',
    'Weitere Änderungen außerhalb dieses Ablaufs+150,00 €',
    'Zu verteilen jetzt35,00 €',
    'Noch unterfinanziert175,50 € in 2 Kategorien',
    'Noch überzogen23,40 € in 1 Kategorie',
  ]);
  expect(screen.getByTestId('distribute-state').textContent).toBe(
    'Noch nicht alles verteilt. Der Rest bleibt in „Zu verteilen“.',
  );
  expect(screen.getByRole('link', { name: 'Zu Heute' }).getAttribute('href')).toBe('/');

  // Reload: same step, same pass figures.
  reload(() =>
    render(
      flow(
        view({ assignedCents: 295_000, toBeAssignedCents: 3_500 }, [
          envelope('rent', { assignedCents: 80_000, availableCents: 80_000 }),
        ]),
      ),
    ),
  );
  expect(stepTitle()).toBe('4. Rest und Zusammenfassung');
  expect(rows()[0]).toBe('In diesem Durchgang zugewiesen800,00 €');
  fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Plan' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('budget.geld-verteilen.2026-10')).toBeNull();
});

it('opened with 2.000,00 € assigned, +300,00 € elsewhere, reopened: pass 0,00 €, outside 300,00 €', () => {
  const start = view({ assignedCents: 200_000 });
  render(flow(start));
  for (let i = 0; i < 3; i += 1) next();
  reload(() => render(flow(view({ assignedCents: 230_000, toBeAssignedCents: 68_500 }))));
  const rows = [...screen.getByTestId('distribute-summary').querySelectorAll('div')].map(
    (d) => d.textContent,
  );
  expect(rows.slice(0, 2)).toEqual([
    'In diesem Durchgang zugewiesen0,00 €',
    'Weitere Änderungen außerhalb dieses Ablaufs+300,00 €',
  ]);
});

it('leaving the flow inside the app ends the pass; a stored pass of another month is ignored', () => {
  render(flow(view({})));
  next();
  expect(sessionStorage.getItem('budget.geld-verteilen.2026-10')).not.toBeNull();
  cleanup();
  expect(sessionStorage.getItem('budget.geld-verteilen.2026-10')).toBeNull();
  sessionStorage.setItem(
    'budget.geld-verteilen.2026-10',
    JSON.stringify({
      month: '2026-09',
      startedAt: 'x',
      step: 4,
      reached: 4,
      startAssignedCents: 1,
      log: [],
    }),
  );
  render(flow(view({})));
  expect(stepTitle()).toBe('1. Eingang prüfen');
});

it('covers from "Zu verteilen" only up to what is there; count and sum use the same rows', async () => {
  const credit = envelope('fun', {
    needCents: 5_000,
    activityCents: -4_000,
    availableCents: -4_000,
    overspentCents: 4_000,
    creditOverspentCents: 4_000,
  });
  render(flow(view({ toBeAssignedCents: 100 }, [credit])));
  next();
  next();
  const block = screen.getByTestId('distribute-cover');
  expect(block.querySelector('p')!.textContent).toBe(
    '2 überzogen · 63,40 € zu decken. Decken nimmt das Geld aus „Zu verteilen“.',
  );
  expect(within(block).queryByRole('button', { name: /Alle überzogenen decken/ })).toBeNull();
  expect(
    within(block)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label')),
  ).toEqual(['1,00 € an Synthetic food aus „Zu verteilen“ decken']);
  expect(screen.getByTestId('distribute-uncovered-rest').textContent).toMatch(
    /danach bleiben 62,40 € ungedeckt/,
  );
  fireEvent.click(within(block).getByRole('button'));
  // The guarded assignment (preview basis) of the Zuweisen step, never an unguarded move.
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'food', assignedCents: 10_100 }]);
  expect(posts).toEqual([]);

  cleanup();
  sessionStorage.clear();
  posts = [];
  render(flow(view({ toBeAssignedCents: 7_000 }, [credit])));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: 'Alle überzogenen decken · 63,40 €' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({
    path: '/api/budget/2026-10/move',
    body: { coverAll: true, fromId: null },
  });
});

it("a take-back limited by the month's assignment says the rest must come from elsewhere", async () => {
  const trip = envelope('spare', {
    assignedCents: 10_000,
    availableCents: 25_000,
    freeCents: 25_000,
  });
  render(flow(view({ toBeAssignedCents: -20_000 }, [trip])));
  next();
  next();
  const list = screen.getByTestId('distribute-takeback');
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Synthetic sparefrei 250,00 €100,00 € zurücknehmen']);
  expect(screen.getByTestId('distribute-missing').textContent).toBe(
    'Zurücknehmen geht nur bis zur Zuweisung dieses Monats: es fehlen weiterhin 100,00 €. Den Rest musst du bei anderen Kategorien zurücknehmen oder durch eine Einnahme decken.',
  );
  fireEvent.click(within(list).getByRole('button'));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'spare', assignedCents: 0 }]);
  for (let i = 0; i < 1; i += 1) next();
  expect(
    [...screen.getByTestId('distribute-summary').querySelectorAll('div')]
      .map((d) => d.textContent)
      .slice(0, 2),
  ).toEqual(['In diesem Durchgang zugewiesen0,00 €', 'In diesem Durchgang zurückgenommen100,00 €']);
});

it('with nothing available it offers no write', () => {
  render(flow(view({ toBeAssignedCents: 0 })));
  next();
  next();
  expect(screen.getByTestId('distribute-nothing').textContent).toBe('Nichts zu verteilen.');
  expect(screen.queryByTestId('distribute-cover')).toBeNull();
  expect(screen.queryByRole('button', { name: /zuweisen/ })).toBeNull();
});

it('an exact fit assigns every need and leaves nothing over', async () => {
  // 2.340 cover is not taken here: the fill uses exactly the needs 800,00 + 125,50 + 50,00 €.
  render(flow(view({ toBeAssignedCents: 97_550 })));
  next();
  next();
  expect(screen.queryByTestId('distribute-left')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Alle nach Plan zuweisen · 975,50 €' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(assign).toHaveBeenLastCalledWith([
    { categoryId: 'rent', assignedCents: 80_000 },
    { categoryId: 'food', assignedCents: 22_550 },
    { categoryId: 'fun', assignedCents: 5_000 },
  ]);
});

it('a 409 plan change shows the message and the retry uses the rebuilt plan', async () => {
  assign.mockRejectedValueOnce(new ApiError(409, 'plan_preview_changed'));
  const { rerender } = render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: 'Alle nach Plan zuweisen · 975,50 €' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(
    /Der Plan hat sich inzwischen geändert\. Die Vorschläge sind neu berechnet/,
  );
  // The refreshed read model: rent got 300,00 € elsewhere, "Zu verteilen" dropped accordingly.
  rerender(
    flow(
      view({ assignedCents: 230_000, toBeAssignedCents: 68_500 }, [
        envelope('rent', { assignedCents: 30_000, availableCents: 30_000, needCents: 50_000 }),
      ]),
    ),
  );
  expect(screen.getByRole('button', { name: 'Alle nach Plan zuweisen · 675,50 €' })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('alert')).getByRole('button', { name: 'Erneut versuchen' }),
  );
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
  expect(assign).toHaveBeenLastCalledWith([
    { categoryId: 'rent', assignedCents: 80_000 },
    { categoryId: 'food', assignedCents: 22_550 },
    { categoryId: 'fun', assignedCents: 5_000 },
  ]);
});

it("undo acts only on the flow's own last write and is logged after it resolved", async () => {
  render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '50,00 € an Synthetic fun zuweisen' }));
  const undo = await screen.findByRole('button', { name: 'Letzte Änderung rückgängig' });
  await waitFor(() => expect(undo).toHaveProperty('disabled', false));
  // Another write outside the flow becomes the latest action: the flow's undo is off.
  act(() => planHistory(client).set({ label: 'Rückgängig', run: () => {} }));
  expect(undo).toHaveProperty('disabled', true);
  fireEvent.click(undo);
  expect(posts).toEqual([]);
  cleanup();
  sessionStorage.clear();

  render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '50,00 € an Synthetic fun zuweisen' }));
  const own = await screen.findByRole('button', { name: 'Letzte Änderung rückgängig' });
  await waitFor(() => expect(own).toHaveProperty('disabled', false));
  fireEvent.click(own);
  await waitFor(() =>
    expect(posts).toEqual([{ path: '/api/undo', body: { groupId: 'synthetic-group' } }]),
  );
  next();
  expect(
    await screen.findByText('Synthetic fun: 50,00 € zugewiesen (rückgängig gemacht)'),
  ).toBeTruthy();
  expect(screen.getByTestId('distribute-summary').querySelector('dd')!.textContent).toBe('0,00 €');
});

it('a refused undo says so and offers no retry', async () => {
  undoAnswer = () => Response.json({ error: 'undo_refused' }, { status: 409 });
  render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '50,00 € an Synthetic fun zuweisen' }));
  const own = await screen.findByRole('button', { name: 'Letzte Änderung rückgängig' });
  await waitFor(() => expect(own).toHaveProperty('disabled', false));
  fireEvent.click(own);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(
    'Rückgängig ist nicht mehr möglich: der Stand hat sich seither geändert. Bitte prüfe die Zahlen.',
  );
  expect(within(alert).queryByRole('button')).toBeNull();
});

it('keeps only the known guided routine in the Plan search', () => {
  expect(validatePlanFilterSearch({ ablauf: 'verteilen' }).ablauf).toBe('verteilen');
  expect('ablauf' in validatePlanFilterSearch({ ablauf: 'other' })).toBe(false);
});

const credit = () =>
  envelope('fun', {
    needCents: 5_000,
    activityCents: -4_000,
    availableCents: -4_000,
    overspentCents: 4_000,
    creditOverspentCents: 4_000,
  });

it('a stale basis on a capped cover writes nothing, explains, and keeps "Zu verteilen"', async () => {
  assign.mockRejectedValueOnce(new ApiError(409, 'plan_preview_changed'));
  render(flow(view({ toBeAssignedCents: 100 }, [credit()])));
  next();
  next();
  fireEvent.click(
    screen.getByRole('button', { name: '1,00 € an Synthetic food aus „Zu verteilen“ decken' }),
  );
  expect((await screen.findByRole('alert')).textContent).toMatch(
    /fehlgeschlagen\. Der Plan hat sich inzwischen geändert/,
  );
  expect(posts).toEqual([]);
  expect(screen.getByTestId('distribute-tba').textContent).toBe('1,00 €');
  next();
  expect(screen.getByTestId('distribute-summary').querySelector('dd')!.textContent).toBe('0,00 €');
});

it('a failed cover stays retryable; a double click writes once', async () => {
  assign.mockRejectedValueOnce(new Error('synthetic offline'));
  render(flow(view({ toBeAssignedCents: 100 }, [credit()])));
  next();
  next();
  const button = screen.getByRole('button', {
    name: '1,00 € an Synthetic food aus „Zu verteilen“ decken',
  });
  fireEvent.click(button);
  fireEvent.click(button);
  const alert = await screen.findByRole('alert');
  expect(assign).toHaveBeenCalledTimes(1);
  expect(alert.textContent).toMatch(
    /^Synthetic food: 1,00 € aus „Zu verteilen“ gedeckt – fehlgeschlagen/,
  );
  fireEvent.click(within(alert).getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
  expect(assign).toHaveBeenLastCalledWith([{ categoryId: 'food', assignedCents: 10_100 }]);
});

it('cover-all logs what the refetched read model shows was covered, not the plan', async () => {
  coverAnswer = () =>
    Response.json({
      groupId: 'synthetic-move',
      coveredCount: 1,
      openCount: 1,
      missingCents: 4_000,
    });
  // The answer reports 40,00 € open, yet the cap let only 20,00 € reach food: the log follows
  // the read model (+20,00 €), never plan minus missing (23,40 €).
  readView = view({ toBeAssignedCents: 5_000, assignedCents: 202_000 }, [
    credit(),
    envelope('food', {
      assignedCents: 12_000,
      activityCents: -12_340,
      availableCents: -340,
      overspentCents: 340,
      cashOverspentCents: 340,
      needCents: 10_550,
    }),
  ]);
  render(flow(view({ toBeAssignedCents: 7_000 }, [credit()])));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: 'Alle überzogenen decken · 63,40 €' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({
    path: '/api/budget/2026-10/move',
    body: { coverAll: true, fromId: null },
  });
  next();
  await waitFor(() =>
    expect(screen.getByTestId('distribute-summary').querySelector('dd')!.textContent).toBe(
      '20,00 €',
    ),
  );
});

it('a write in flight when the pass is left is reconciled on reopen', async () => {
  // 2.000,00 € assigned at start; rent +800,00 € is still in flight when the page reloads.
  assign.mockImplementationOnce(() => new Promise(() => {}));
  render(flow(view({ assignedCents: 200_000 })));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '800,00 € an Synthetic rent zuweisen' }));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  const after = () =>
    view({ assignedCents: 280_000, toBeAssignedCents: 18_500 }, [
      envelope('rent', { assignedCents: 80_000, availableCents: 80_000 }),
    ]);
  const summary = () =>
    [...screen.getByTestId('distribute-summary').querySelectorAll('div')]
      .map((d) => d.textContent)
      .slice(0, 2);
  const stored = { ...sessionStorage };
  reload(() => render(flow(after())));
  next();
  expect(summary()).toEqual([
    'In diesem Durchgang zugewiesen800,00 €',
    'Zu verteilen jetzt185,00 €',
  ]);

  // The same pending write that never landed (rent unchanged) is dropped, not counted.
  cleanup();
  for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  render(flow(view({ assignedCents: 200_000 })));
  next();
  expect(summary()).toEqual(['In diesem Durchgang zugewiesen0,00 €', 'Zu verteilen jetzt985,00 €']);
});

it("a toast undo of the flow's write removes it from the pass", async () => {
  render(flow(view({})));
  next();
  next();
  fireEvent.click(screen.getByRole('button', { name: '50,00 € an Synthetic fun zuweisen' }));
  await screen.findByText('Synthetic fun: 50,00 € zugewiesen');
  fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(posts).toEqual([{ path: '/api/undo', body: { groupId: 'synthetic-group' } }]),
  );
  next();
  expect(
    await screen.findByText('Synthetic fun: 50,00 € zugewiesen (rückgängig gemacht)'),
  ).toBeTruthy();
  expect(screen.getByTestId('distribute-summary').querySelector('dd')!.textContent).toBe('0,00 €');
});

it('rejects a stored pass with a broken start marker', () => {
  sessionStorage.setItem(
    'budget.geld-verteilen.2026-10',
    JSON.stringify({
      month: '2026-10',
      startedAt: 'not-a-date',
      step: 4,
      reached: 4,
      startAssignedCents: 1,
      log: [],
    }),
  );
  render(flow(view({})));
  expect(stepTitle()).toBe('1. Eingang prüfen');
});
