// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetMonthView } from './budget-api';
import type { CategoryRow } from './api';
import { PlanMonthPage } from './plan-page';

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
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const categories: CategoryRow[] = ['first', 'second', 'single'].map((id, index) => ({
  id,
  name: ['Erster Posten', 'Zweiter Posten', 'Einzelposten'][index]!,
  groupId: index === 2 ? 'alone' : 'together',
  class: 'need',
  kind: 'variable',
  stage: 2,
  icon: null,
  cardAccountId: null,
  rolloverOverspending: false,
  hiddenAt: null,
  splitCount: 0,
  sortOrder: index,
}));
const groups = [
  { id: 'together', name: 'Mustergruppe', sortOrder: 0 },
  { id: 'alone', name: 'Einzelgruppe', sortOrder: 1 },
];
function budget(month: string): BudgetMonthView {
  return {
    groups,
    categories,
    summary: {
      month,
      carryInCents: 0,
      incomeCents: 10000,
      uncoveredCents: 0,
      heldCents: 0,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
      toBeAssignedCents: 10000,
      creditOverspentCents: 0,
      cashOverspentCents: 0,
      cards: [],
      envelopes: categories.map((category) => ({
        categoryId: category.id,
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
      })),
    },
  };
}
let phone: boolean;
let writes: string[];
let phoneListeners: (() => void)[];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: PlanMonthPage });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/plan/monat?monat=2026-10'] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, router };
}
const category = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.pname[data-category-id="${id}"]`)!;
const bar = () => screen.queryByRole('region', { name: 'Kategorienauswahl' });
const pressed = (id: string) => category(id).getAttribute('aria-pressed');
async function enter() {
  await userEvent.click(screen.getByText(/^Optionen/, { selector: 'summary' }));
  await userEvent.click(screen.getByRole('button', { name: 'Auswählen' }));
}
/** Unit events are intentionally untrusted; real native hold proof is a separate browser gate. */
function pointer(target: Element | Window, type: string, over: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 30, clientY: 30 });
  for (const [key, value] of Object.entries({
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    ...over,
  }))
    Object.defineProperty(event, key, { value });
  fireEvent(target, event);
}
function waitHold(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}
beforeEach(() => {
  phone = true;
  writes = [];
  phoneListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)' ? phone : false,
    media: query,
    addEventListener(_event: string, callback: () => void) {
      if (query === '(max-width: 767px)') phoneListeners.push(callback);
    },
    removeEventListener(_event: string, callback: () => void) {
      phoneListeners = phoneListeners.filter((listener) => listener !== callback);
    },
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
      const month = url.pathname.match(/^\/api\/budget\/(\d{4}-\d{2})$/)?.[1];
      const body = month
        ? budget(month)
        : url.pathname === '/api/categories'
          ? { groups, categories, targets: [] }
          : url.pathname === '/api/accounts'
            ? { accounts: [] }
            : url.pathname === '/api/expected'
              ? { payments: [] }
              : {};
      return new Response(JSON.stringify(body), { status: method === 'GET' ? 200 : 422 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('phone selection has no checkbox dependency or implicit financial writes', () => {
  it('keeps ordinary inspection separate from the explicit phone mode', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(bar()).toBeNull();
    await userEvent.click(category('first'));
    expect(
      within(screen.getByRole('complementary', { name: 'Plan-Inspektor' })).getByRole('heading', {
        name: 'Erster Posten',
      }),
    ).toBeTruthy();
    expect(bar()).toBeNull();
    await enter();
    expect(bar()).not.toBeNull();
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('exposes keyboard category/group/all states, keeps collapse distinct and clears on exit', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    await enter();
    expect(bar()).not.toBeNull();
    expect(pressed('first')).toBe('false');
    category('first').focus();
    await userEvent.keyboard(' ');
    expect(pressed('first')).toBe('true');
    const group = screen.getByRole('button', { name: 'Gruppe Mustergruppe auswählen' });
    const all = screen.getByRole('button', { name: 'Alle Kategorien auswählen' });
    expect(group.getAttribute('aria-pressed')).toBe('mixed');
    expect(all.getAttribute('aria-pressed')).toBe('mixed');
    await userEvent.click(group);
    expect(pressed('second')).toBe('true');
    expect(pressed('single')).toBe('false');
    expect(group.getAttribute('aria-pressed')).toBe('true');
    const collapse = screen.getByRole('button', { name: 'Gruppe Mustergruppe' });
    await userEvent.click(collapse);
    expect(document.querySelector('.pname[data-category-id="first"]')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Gruppe Mustergruppe auswählen' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Gruppe Mustergruppe' }));
    expect(pressed('first')).toBe('true');
    expect(pressed('second')).toBe('true');
    await userEvent.click(all);
    expect(pressed('single')).toBe('true');
    await userEvent.click(all);
    expect(categories.map((c) => pressed(c.id))).toEqual(['false', 'false', 'false']);
    expect(bar()).not.toBeNull();
    await userEvent.click(category('second'));
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Auswahl beenden' }));
    expect(bar()).toBeNull();
    expect(categories.map((c) => pressed(c.id))).toEqual(['false', 'false', 'false']);
    expect(document.activeElement).toBe(category('second'));
    expect(writes).toEqual([]);
  });

  it.each(['Wasserfall', 'Zeit', 'Klassen'])(
    'keeps %s checkbox-free with the same all-category identity',
    async (label) => {
      mount();
      await screen.findByRole('button', { name: 'Erster Posten' });
      await userEvent.click(screen.getByText(/^Optionen/, { selector: 'summary' }));
      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      await enter();
      await userEvent.click(screen.getByRole('button', { name: 'Alle Kategorien auswählen' }));
      expect(categories.map((c) => pressed(c.id))).toEqual(['true', 'true', 'true']);
      expect(writes).toEqual([]);
    },
  );

  it('accepts exactly the hold threshold and consumes only its follow-up click', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    waitHold(499);
    expect(bar()).toBeNull();
    waitHold(1);
    expect(bar()).not.toBeNull();
    expect(pressed('first')).toBe('true');
    pointer(category('first'), 'pointerup');
    fireEvent.click(category('first'), { detail: 1 });
    expect(pressed('first')).toBe('true');
    pointer(category('second'), 'pointerdown');
    pointer(category('second'), 'pointerup');
    fireEvent.click(category('second'), { detail: 1 });
    expect(pressed('second')).toBe('true');
    pointer(category('first'), 'pointerdown');
    pointer(category('first'), 'pointerup');
    fireEvent.click(category('first'), { detail: 1 });
    expect(pressed('first')).toBe('false');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bar()).toBeNull();
    expect(pressed('second')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('never consumes a later deliberate tap or keyboard click when the accepted hold has no generated click', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    waitHold(500);
    pointer(category('first'), 'pointerup');
    fireEvent.contextMenu(category('first'));
    expect(pressed('first')).toBe('true');
    // A keyboard/switch activation has detail0 and must retain its normal toggle behavior.
    fireEvent.click(category('first'), { detail: 0 });
    expect(pressed('first')).toBe('false');
    pointer(category('first'), 'pointerdown');
    waitHold(500);
    pointer(category('first'), 'pointerup');
    expect(pressed('first')).toBe('true');
    // This is a NEW gesture, not the absent compatibility click of the preceding hold.
    pointer(category('first'), 'pointerdown');
    pointer(category('first'), 'pointerup');
    fireEvent.click(category('first'), { detail: 1 });
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('does not activate a newly mounted bulk action underneath the accepted hold release', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    waitHold(500);
    const goal = within(bar()!).getByRole('button', { name: 'Ziel' });
    pointer(goal, 'pointerup');
    fireEvent.click(goal, { detail: 1 });
    expect(writes).toEqual([]);
    expect(pressed('first')).toBe('true');
  });

  it.each([
    'early-release',
    'pointercancel',
    'scroll',
    'move',
    'second-pointer',
    'blur',
    'resize',
  ] as const)('cancels a pending hold on %s without opening mode or writing', async (cancel) => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    waitHold(200);
    if (cancel === 'early-release') pointer(category('first'), 'pointerup');
    else if (cancel === 'pointercancel') pointer(category('first'), 'pointercancel');
    else if (cancel === 'scroll') fireEvent.scroll(window);
    else if (cancel === 'move') pointer(category('first'), 'pointermove', { clientY: 60 });
    else if (cancel === 'blur') fireEvent.blur(window);
    else if (cancel === 'resize') fireEvent.resize(window);
    else pointer(category('second'), 'pointerdown', { pointerId: 2, isPrimary: false });
    waitHold(600);
    expect(bar()).toBeNull();
    expect(writes).toEqual([]);
  });

  it('never maps parent, add-category or available-money holds to the first child', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const target of [
      screen.getByRole('button', { name: 'Gruppe Mustergruppe' }),
      screen.getByRole('button', { name: 'Kategorie in Mustergruppe anlegen' }),
      screen.getByRole('button', { name: 'Zugewiesen für Erster Posten ändern' }),
    ]) {
      pointer(target, 'pointerdown');
      waitHold(600);
      pointer(target, 'pointerup');
      expect(bar()).toBeNull();
    }
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('cancels the pending timer when unmounted', async () => {
    const view = mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    view.unmount();
    waitHold(600);
    expect(writes).toEqual([]);
    expect(bar()).toBeNull();
  });

  it('clears mode when the month changes', async () => {
    const view = mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    await enter();
    await userEvent.click(category('first'));
    expect(pressed('first')).toBe('true');
    await act(async () => view.router.history.push('/plan/monat?monat=2026-11'));
    await screen.findByRole('button', { name: 'Erster Posten' });
    expect(bar()).toBeNull();
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('clears phone selection on resize so desktop receives no hidden selected IDs', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    await enter();
    await userEvent.click(category('first'));
    act(() => {
      phone = false;
      for (const listener of [...phoneListeners]) listener();
    });
    expect(bar()).toBeNull();
    const first = screen.getByRole('checkbox', { name: 'Erster Posten auswählen' });
    expect((first as HTMLInputElement).checked).toBe(false);
    expect(writes).toEqual([]);
  });

  it('keeps desktop native checkbox selection and ignores mouse holds', async () => {
    phone = false;
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    const first = screen.getByRole('checkbox', { name: 'Erster Posten auswählen' });
    await userEvent.click(first);
    expect((first as HTMLInputElement).checked).toBe(true);
    expect(bar()).toBeNull();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('second'), 'pointerdown', { pointerType: 'mouse' });
    waitHold(600);
    pointer(category('second'), 'pointerup', { pointerType: 'mouse' });
    expect(pressed('second')).toBe('false');
    expect(bar()).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe('accepted hold compatibility click stays separate from deliberate financial input', () => {
  it.each(['move', 'scroll'] as const)(
    'keeps the accepted gesture shield after %s until its release click',
    async (cancel) => {
      mount();
      await screen.findByRole('button', { name: 'Erster Posten' });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      pointer(category('first'), 'pointerdown');
      waitHold(500);
      expect(pressed('first')).toBe('true');
      const goal = within(bar()!).getByRole('button', { name: 'Ziel' });
      expect((goal as HTMLButtonElement).disabled).toBe(false);
      if (cancel === 'move') pointer(category('first'), 'pointermove', { clientX: 50 });
      else fireEvent.scroll(window);
      pointer(goal, 'pointerup');
      await act(async () => {
        fireEvent.click(goal, { detail: 1 });
      });
      expect(writes).toEqual([]);
      expect(pressed('first')).toBe('true');
    },
  );

  it('allows a fresh deliberate gesture to send the original exact selected target request', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(category('first'), 'pointerdown');
    waitHold(500);
    pointer(category('first'), 'pointerup');
    const goal = within(bar()!).getByRole('button', { name: 'Ziel' });
    expect((goal as HTMLButtonElement).disabled).toBe(false);
    pointer(goal, 'pointerdown');
    pointer(goal, 'pointerup');
    await act(async () => {
      fireEvent.click(goal, { detail: 1 });
    });
    expect(writes).toEqual(['POST /api/budget/2026-10/quick-assign']);
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(String(posts[0]![0])).toBe('/api/budget/2026-10/quick-assign');
    expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({
      mode: 'target',
      categoryIds: ['first'],
    });
  });
});

describe('accepted native pointer ownership stays on the held category', () => {
  it('captures the original button only at500ms and before the action bar mounts', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    const held = category('first');
    const capture = vi.fn((id: number) => {
      expect(id).toBe(1);
      expect(bar()).toBeNull();
      expect(pressed('first')).toBe('false');
    });
    held.setPointerCapture = capture;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(held, 'pointerdown');
    waitHold(499);
    expect(capture).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
    waitHold(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.contexts[0]).toBe(held);
    expect(bar()).not.toBeNull();
    expect(pressed('first')).toBe('true');
    pointer(held, 'pointerup');
    fireEvent.click(held, { detail: 1 });
    expect(pressed('first')).toBe('true');
    expect(writes).toEqual([]);
  });

  it('leaves pending touch movement uncaptured and cancels its hold without writes', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    const held = category('first');
    const capture = vi.fn();
    held.setPointerCapture = capture;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(held, 'pointerdown');
    waitHold(200);
    pointer(held, 'pointermove', { clientX: 50 });
    waitHold(600);
    expect(capture).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });

  it('does not accept or mount financial controls if the native pointer is no longer active', async () => {
    mount();
    await screen.findByRole('button', { name: 'Erster Posten' });
    const held = category('first');
    held.setPointerCapture = vi.fn(() => {
      throw new DOMException('Pointer no longer active', 'NotFoundError');
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(held, 'pointerdown');
    waitHold(500);
    expect(held.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(bar()).toBeNull();
    expect(pressed('first')).toBe('false');
    expect(writes).toEqual([]);
  });
});
