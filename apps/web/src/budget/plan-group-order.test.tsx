// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CategoryTree } from './api';
import { orderOf, type Order } from './categories-model';
import { usePlanGroupOrder } from './plan-group-order';

const mocks = vi.hoisted(() => ({ sort: vi.fn() }));
vi.mock('./api', () => ({ sortCategories: mocks.sort }));
vi.mock('./use-category-writes', () => ({
  useBudgetWrite: () => async (run: () => Promise<unknown>) => run(),
}));
vi.mock('./month-span', () => ({ useIsPhone: () => true }));

const tree: CategoryTree = {
  groups: ['first', 'hidden', 'empty', 'last'].map((id, sortOrder) => ({
    id,
    name: id,
    sortOrder,
  })),
  categories: [
    {
      id: 'archived',
      name: 'Synthetic archived',
      groupId: 'hidden',
      sortOrder: 0,
      class: 'need',
      kind: 'variable',
      icon: null,
      stage: null,
      cardAccountId: null,
      hiddenAt: '2026-09-01',
      rolloverOverspending: false,
      splitCount: 0,
    },
  ],
  targets: [],
};
const visible = ['first', 'empty', 'last'];
function Harness({ source }: { source: CategoryTree | undefined }) {
  const sort = usePlanGroupOrder(source);
  return (
    <>
      <button type="button">Outside focus</button>
      <p role="status" aria-live="polite">
        {sort.announcement}
      </p>
      {(source ? sort.order : orderOf(tree))
        .filter((group) => visible.includes(group.id))
        .map((group, index) => (
          <div key={`${index}-${group.id}`} {...sort.dropTarget(group.id)}>
            {sort.handle(group.id, group.id, visible)}
          </div>
        ))}
    </>
  );
}
beforeEach(() => {
  mocks.sort.mockReset();
});
afterEach(cleanup);
const handle = (id: string) =>
  screen.getByRole<HTMLButtonElement>('button', { name: `Gruppe ${id} verschieben` });

it('disables dragging, keyboard and phone controls while the tree loads', () => {
  render(<Harness source={undefined} />);
  expect(handle('first').getAttribute('aria-disabled')).toBe('true');
  expect(handle('first').draggable).toBe(false);
  expect(fireEvent.keyDown(handle('first'), { key: 'ArrowDown' })).toBe(true);
  fireEvent.click(handle('first'));
  expect(handle('first').getAttribute('aria-expanded')).toBe('false');
  expect(
    (screen.getByRole('button', { name: 'Gruppe first nach unten' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(mocks.sort).not.toHaveBeenCalled();
});

it.each(['keyboard', 'phone', 'touch'] as const)(
  '%s swaps visible neighbours, keeps the complete payload and restores focus after remount',
  async (input) => {
    let finish!: (result: { groupId: string }) => void;
    mocks.sort.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(<Harness source={tree} />);
    expect(
      (screen.getByRole('button', { name: 'Gruppe first nach oben' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    if (input === 'keyboard') {
      handle('first').focus();
      fireEvent.keyDown(handle('first'), { key: 'ArrowDown' });
    } else {
      if (input === 'touch') screen.getByRole('button', { name: 'Outside focus' }).focus();
      fireEvent.click(handle('first'));
      const down = screen.getByRole('button', { name: 'Gruppe first nach unten' });
      if (input === 'phone') down.focus();
      fireEvent.click(down);
    }
    const expected: Order = [
      { id: 'empty', categoryIds: [] },
      { id: 'hidden', categoryIds: ['archived'] },
      { id: 'first', categoryIds: [] },
      { id: 'last', categoryIds: [] },
    ];
    expect(mocks.sort).toHaveBeenCalledExactlyOnceWith(expected);
    expect(document.activeElement).toBe(handle('first'));
    expect(handle('first').getAttribute('aria-disabled')).toBe('true');
    expect(handle('first').draggable).toBe(false);
    expect(fireEvent.keyDown(handle('first'), { key: 'ArrowDown' })).toBe(true);
    expect(mocks.sort).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(
        <Harness
          source={{
            ...tree,
            groups: expected.map((group, sortOrder) => ({
              id: group.id,
              name: group.id,
              sortOrder,
            })),
          }}
        />,
      );
      finish({ groupId: 'synthetic-audit' });
    });
    expect(document.activeElement).toBe(handle('first'));
    expect(screen.getByRole('status').textContent).toBe('Gruppe nach unten verschoben');
    expect(handle('first').draggable).toBe(true);
    fireEvent.keyDown(handle('first'), { key: 'ArrowUp' });
    expect(mocks.sort).toHaveBeenLastCalledWith(orderOf(tree));
    await act(async () => {
      finish({ groupId: 'synthetic-audit-up' });
    });
    expect(screen.getByRole('status').textContent).toBe('Gruppe nach oben verschoben');
  },
);
