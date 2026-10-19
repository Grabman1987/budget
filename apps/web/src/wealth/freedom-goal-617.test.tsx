// @vitest-environment jsdom
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { FreedomGoalState } from '@budget/domain';
import type { ReactNode } from 'react';
import { ApiError } from '../api/http';
import { FreedomContent } from './freedom-page';
import {
  freedomGoalQuery,
  changeFreedomGoal,
  FREEDOM_GOAL_KEY,
  type FreedomView,
} from './freedom-api';
import { undoGroup } from '../ledger/api';
import type * as FreedomApi from './freedom-api';
import type * as LedgerApi from '../ledger/api';

vi.mock('./freedom-api', async (importOriginal) => ({
  ...(await importOriginal<typeof FreedomApi>()),
  changeFreedomGoal: vi.fn(),
}));
vi.mock('../ledger/api', async (importOriginal) => ({
  ...(await importOriginal<typeof LedgerApi>()),
  undoGroup: vi.fn(),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#synthetic">{children}</a>,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
const initial: FreedomGoalState = {
  schemaVersion: 1,
  revision: 'goal-a',
  ageRevision: 'age-a',
  goalYear: 2027,
  goalAge: 47,
  ageAvailable: true,
  unavailable: false,
  asOf: '2026-10-19',
};
const view: FreedomView = {
  asOf: '2026-10-19',
  refMonth: '2026-09',
  months: [{ month: '2026-09', consumptionCents: 40 }],
  annualSpendCents: 40,
  multiple: 25,
  targetCents: 1000,
  investedCents: 0,
  progressBp: 0,
  defaultRealReturnBp: 0,
  defaultSavingCents: 100,
  savingMonths: 1,
  expensesUnsafe: false,
  accounts: [],
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  for (const client of clients.splice(0)) client.clear();
  vi.clearAllMocks();
});

function mount(
  server: { state: FreedomGoalState },
  fetchState: () => Promise<FreedomGoalState> = async () => server.state,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  clients.push(client);
  function Content() {
    const goal = useQuery({ ...freedomGoalQuery(), queryFn: fetchState });
    return (
      <FreedomContent
        view={view}
        goalRequest={{
          state: goal.data,
          pending: goal.isPending,
          error: goal.isError,
          refresh: async () => (await goal.refetch()).data,
        }}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Content />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

it('preserves a dirty draft and its old CAS token across background refresh, then explicitly retries with the loaded token', async () => {
  const server = { state: { ...initial } };
  const posted: { revision: string; year: number }[] = [];
  vi.mocked(changeFreedomGoal).mockImplementation(async (revision, change) => {
    if (change.kind !== 'year') throw new Error('Unexpected synthetic write');
    posted.push({ revision, year: change.year });
    if (revision !== server.state.revision)
      throw new ApiError(409, 'conflict', 'Das Ziel wurde inzwischen geändert.');
    server.state = {
      ...server.state,
      goalYear: change.year,
      goalAge: change.year - 1980,
      revision: 'goal-c',
    };
    return { ...server.state, changed: true, groupId: 'synthetic-group' };
  });
  const client = mount(server);
  const field = await screen.findByLabelText('Zieljahr', { exact: true });
  await waitFor(() => expect((field as HTMLInputElement).value).toBe('2027'));
  await userEvent.clear(field);
  await userEvent.type(field, '2028');
  server.state = { ...server.state, revision: 'goal-b', goalYear: 2029, goalAge: 49 };
  await act(() => client.invalidateQueries({ queryKey: FREEDOM_GOAL_KEY }));
  expect((field as HTMLInputElement).value).toBe('2028');
  await userEvent.click(screen.getByRole('button', { name: 'Ziel speichern' }));
  await screen.findByText(/Deine Eingabe bleibt erhalten/);
  expect(posted).toEqual([{ revision: 'goal-a', year: 2028 }]);
  expect(server.state.goalYear).toBe(2029);
  expect((field as HTMLInputElement).value).toBe('2028');
  await userEvent.click(screen.getByRole('button', { name: 'Aktuellen Stand laden' }));
  await screen.findByText(/Aktueller Stand geladen/);
  await userEvent.click(screen.getByRole('button', { name: 'Ziel speichern' }));
  await waitFor(() => expect(server.state.goalYear).toBe(2028));
  expect(posted).toEqual([
    { revision: 'goal-a', year: 2028 },
    { revision: 'goal-b', year: 2028 },
  ]);
});

it.each([
  { mode: 'year', otherMode: 'age', label: 'Zieljahr', original: '2028', edited: '2030' },
  { mode: 'age', otherMode: 'year', label: 'Alter im Kalenderjahr', original: '48', edited: '50' },
] as const)(
  'fences a pending $mode reload against mode changes while preserving the latest same-mode edit and fresh CAS',
  async ({ mode, otherMode, label, original, edited }) => {
    const server = { state: { ...initial } };
    let resolveRefresh!: (state: FreedomGoalState) => void;
    const pending = new Promise<FreedomGoalState>((resolve) => {
      resolveRefresh = resolve;
    });
    let defer = false;
    const fetchState = async () => (defer ? pending : server.state);
    vi.mocked(changeFreedomGoal)
      .mockRejectedValueOnce(new ApiError(409, 'conflict', 'Das Ziel wurde inzwischen geändert.'))
      .mockImplementation(async (_revision, change) => {
        const goalYear = change.kind === 'year' ? change.year : 2030;
        server.state = { ...server.state, goalYear, goalAge: goalYear - 1980, revision: 'goal-c' };
        return { ...server.state, changed: true, groupId: 'synthetic-reload-group' };
      });
    mount(server, fetchState);
    const selector = await screen.findByLabelText('Ziel bis', { exact: true });
    await waitFor(() =>
      expect((screen.getByLabelText('Zieljahr') as HTMLInputElement).value).toBe('2027'),
    );
    if (mode === 'age') await userEvent.selectOptions(selector, mode);
    const field = screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, original);
    await userEvent.click(screen.getByRole('button', { name: 'Ziel speichern' }));
    const reload = await screen.findByRole('button', { name: 'Aktuellen Stand laden' });
    await waitFor(() => expect(reload.matches(':disabled')).toBe(false));
    defer = true;
    await userEvent.click(reload);
    await screen.findByText('Aktueller Stand wird geladen …');
    expect(selector.matches(':disabled')).toBe(true);
    await userEvent.selectOptions(selector, otherMode);
    expect((selector as HTMLSelectElement).value).toBe(mode);
    expect(field.matches(':disabled')).toBe(false);
    await userEvent.clear(field);
    await userEvent.type(field, edited);
    expect(screen.getByRole('button', { name: 'Ziel speichern' }).matches(':disabled')).toBe(true);
    server.state = {
      ...server.state,
      goalYear: 2029,
      goalAge: 49,
      revision: 'goal-b',
      ageRevision: 'age-b',
    };
    await act(async () => resolveRefresh(server.state));
    await screen.findByText(/Aktueller Stand geladen/);
    expect(selector.matches(':disabled')).toBe(false);
    expect(field.value).toBe(edited);
    await userEvent.click(screen.getByRole('button', { name: 'Ziel speichern' }));
    expect(changeFreedomGoal).toHaveBeenLastCalledWith(
      'goal-b',
      mode === 'year'
        ? { kind: 'year', year: 2030 }
        : { kind: 'age', age: 50, ageRevision: 'age-b' },
    );
    expect(changeFreedomGoal).toHaveBeenCalledTimes(2);
  },
);

it('uses age revisions in the body and offers grouped undo/redo without persisting scenario assumptions', async () => {
  const server = { state: { ...initial } };
  vi.mocked(changeFreedomGoal).mockImplementation(async (revision, change) => {
    expect(revision).toBe('goal-a');
    expect(change).toEqual({ kind: 'age', age: 48, ageRevision: 'age-a' });
    server.state = { ...server.state, goalYear: 2028, goalAge: 48, revision: 'goal-b' };
    return { ...server.state, changed: true, groupId: 'save-group' };
  });
  vi.mocked(undoGroup).mockImplementation(async (groupId) => {
    server.state = {
      ...server.state,
      goalYear: groupId === 'save-group' ? 2027 : 2028,
      goalAge: groupId === 'save-group' ? 47 : 48,
      revision: groupId === 'save-group' ? 'undo-head' : 'redo-head',
    };
    return { groupId: groupId === 'save-group' ? 'undo-group' : 'redo-group', undone: 1 };
  });
  mount(server);
  await waitFor(() =>
    expect((screen.getByLabelText('Zieljahr') as HTMLInputElement).value).toBe('2027'),
  );
  await userEvent.selectOptions(screen.getByLabelText('Ziel bis', { exact: true }), 'age');
  const age = screen.getByLabelText('Alter im Kalenderjahr', { exact: true });
  await userEvent.clear(age);
  await userEvent.type(age, '48');
  await userEvent.click(screen.getByRole('button', { name: 'Ziel speichern' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
  await waitFor(() => expect((age as HTMLInputElement).value).toBe('47'));
  await userEvent.click(await screen.findByRole('button', { name: 'Wiederholen' }));
  await waitFor(() => expect((age as HTMLInputElement).value).toBe('48'));
  expect(vi.mocked(undoGroup).mock.calls).toEqual([['save-group'], ['undo-group']]);
  expect((screen.getByLabelText('Sparrate pro Monat') as HTMLInputElement).value).toBe('1,00');
});

it('masks the actual required amount in all text/ARIA channels and leaves year mode usable without DOB', async () => {
  const server = { state: { ...initial, ageAvailable: false, goalAge: null } };
  mount(server);
  const result = await screen.findByTestId('freedom-required-saving');
  expect(result.textContent).toContain('3,34');
  expect(
    (screen.getByRole('option', { name: 'Alter im Kalenderjahr' }) as HTMLOptionElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Zieljahr') as HTMLInputElement).disabled).toBe(false);
  act(() => setAmountsHidden(true));
  expect(result.textContent).toContain('•••');
  expect(result.textContent).not.toContain('3,34');
  for (const element of document.querySelectorAll('[aria-label], [aria-valuetext], [title]'))
    expect(
      [
        element.getAttribute('aria-label'),
        element.getAttribute('aria-valuetext'),
        element.getAttribute('title'),
      ].join(' '),
    ).not.toContain('3,34');
});

it('preserves unknown stored settings and does not offer writes or invented rates', async () => {
  const server = { state: { ...initial, unavailable: true, goalYear: null, goalAge: null } };
  mount(server);
  await screen.findByText(/bleibt unverändert erhalten/);
  const save = screen.getByRole('button', { name: 'Ziel speichern' });
  expect(save.matches(':disabled')).toBe(true);
  await userEvent.click(save);
  expect(screen.queryByTestId('freedom-required-saving')).toBeNull();
  expect(changeFreedomGoal).not.toHaveBeenCalled();
});
