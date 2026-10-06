// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  createTestDatabase,
  createExpectedPayment,
  INCOME_TYPES,
  createEntity,
  schema,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from '../../../server/src/api';
import type { MonthCloseView } from './api';
import { NextMonthPlan } from './next-month-plan';
import { cents } from '@budget/domain';

afterEach(cleanup);
async function getPlan(opened: ReturnType<typeof createTestDatabase>) {
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-02',
    stepUp: async (_c, next) => next(),
  });
  const response = await api.request('/month-close/2026-09');
  expect(response.status).toBe(200);
  return ((await response.json()) as MonthCloseView).nextPlan;
}
async function renderPlan(node: React.ReactNode) {
  const root = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: root.addChildren(
      [
        '/',
        '/reports/vorschau',
        '/reports/gesamttabelle',
        '/reports/budgettreue',
        '/reports/kategorien',
      ].map((path) => createRoute({ getParentRoute: () => root, path })),
    ),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId('close-plan-remaining');
}
it('previews all groups, blocks unfunded drafts and applies cent-exact plans with the selected scope', async () => {
  const opened = createTestDatabase();
  try {
    createEntity(
      opened.db,
      schema.account,
      {
        id: 'a',
        name: 'Musterkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: 100000,
      },
      { actor: 'test' },
    );
    createEntity(
      opened.db,
      schema.categoryGroup,
      { id: 'g1', name: 'Gruppe A' },
      { actor: 'test' },
    );
    createEntity(
      opened.db,
      schema.categoryGroup,
      { id: 'g2', name: 'Gruppe B' },
      { actor: 'test' },
    );
    for (const [id, groupId, cls] of [
      ['c1', 'g1', 'need'],
      ['c2', 'g2', 'want'],
      ['c3', 'g2', 'future'],
    ] as const)
      createEntity(
        opened.db,
        schema.category,
        { id, name: id, groupId, class: cls },
        { actor: 'test' },
      );
    createExpectedPayment(
      opened.db,
      {
        name: 'Mustereinkommen',
        kind: 'inflow',
        accountId: 'a',
        incomeTypeId: INCOME_TYPES.salary.id,
        dueDay: 15,
        startDate: '2026-10-01',
      },
      { validFrom: '2026-10-01', amountCents: 200000 },
      { actor: 'test' },
      '2026-10-02',
    );
    let applied: unknown;
    const user = userEvent.setup();
    const data = await getPlan(opened);
    await renderPlan(
      <NextMonthPlan
        data={data}
        onApply={async (items) => {
          applied = items;
          return true;
        }}
      />,
    );
    expect(screen.getByTestId('close-plan-remaining').textContent).toContain('1.000,00');
    await user.clear(screen.getByLabelText('Plan für c1'));
    await user.type(screen.getByLabelText('Plan für c1'), '600');
    await user.clear(screen.getByLabelText('Plan für c2'));
    await user.type(screen.getByLabelText('Plan für c2'), '401');
    expect(screen.getByTestId('close-plan-remaining').textContent).toContain('−1,00');
    expect(
      (screen.getByRole('button', { name: 'Plan übernehmen · alle' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.clear(screen.getByLabelText('Plan für c2'));
    await user.type(screen.getByLabelText('Plan für c2'), '400');
    expect(screen.getByTestId('close-plan-remaining').textContent).toContain('0,00');
    await user.click(screen.getByRole('button', { name: 'Plan übernehmen · alle' }));
    expect(applied).toEqual([
      { categoryId: 'c1', assignedCents: 60000 },
      { categoryId: 'c2', assignedCents: 40000 },
    ]);
    await user.clear(screen.getByLabelText('Plan für c1'));
    await user.type(screen.getByLabelText('Plan für c1'), '600');
    await user.clear(screen.getByLabelText('Plan für c2'));
    await user.type(screen.getByLabelText('Plan für c2'), '400');
    await user.click(
      within(screen.getByRole('region', { name: 'Gruppe A' })).getByRole('button', {
        name: 'Plan übernehmen',
      }),
    );
    expect(applied).toEqual([{ categoryId: 'c1', assignedCents: 60000 }]);
    expect((screen.getByLabelText('Plan für c2') as HTMLInputElement).value).toBe('400');
    await user.clear(screen.getByLabelText('Plan für c1'));
    await user.type(screen.getByLabelText('Plan für c1'), '90071992547409,91');
    await user.clear(screen.getByLabelText('Plan für c2'));
    await user.type(screen.getByLabelText('Plan für c2'), '90071992547409,91');
    expect(screen.getByRole('alert').textContent).toContain('Entwurf ist zu groß');
    expect(
      (screen.getByRole('button', { name: 'Plan übernehmen · alle' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    data.budget = {
      ...data.budget,
      summary: {
        ...data.budget.summary,
        toBeAssignedCents: cents(1),
        envelopes: data.budget.summary.envelopes.map((e) => ({
          ...e,
          assignedCents: cents(
            e.categoryId === 'c1'
              ? -9007199254740991
              : e.categoryId === 'c3'
                ? 9007199254740991
                : 0,
          ),
        })),
      },
    };
    await user.click(screen.getByRole('button', { name: 'wie Vormonat · alle' }));
    await user.clear(screen.getByLabelText('Plan für c2'));
    await user.type(screen.getByLabelText('Plan für c2'), '0,02');
    expect(screen.getByTestId('close-plan-remaining').textContent).toContain('−0,01');
    expect(
      (screen.getByRole('button', { name: 'Plan übernehmen · alle' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  } finally {
    opened.close();
  }
});

it('history buttons only prepare a draft and do not treat missing history as zero', async () => {
  const opened = createTestDatabase();
  try {
    seedBasics(opened.db);
    const data = await getPlan(opened);
    data.previousAssigned = { miete: 10000, essen: 20000, reise: 5000 };
    data.history = data.history.map((h) => ({
      ...h,
      averageCents: h.categoryId === 'essen' ? cents(25000) : null,
      historyCount: h.categoryId === 'essen' ? 12 : 0,
    }));
    let applied = false;
    await renderPlan(
      <NextMonthPlan
        data={data}
        onApply={async () => {
          applied = true;
          return true;
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'wie Vormonat · alle' }));
    expect((screen.getByLabelText('Plan für Miete') as HTMLInputElement).value).toBe('100,00');
    await user.click(screen.getByRole('button', { name: 'Durchschnitt · alle' }));
    expect((screen.getByLabelText('Plan für Miete') as HTMLInputElement).value).toBe('100,00');
    expect((screen.getByLabelText('Plan für Essen') as HTMLInputElement).value).toBe('250,00');
    expect(applied).toBe(false);
  } finally {
    opened.close();
  }
});
