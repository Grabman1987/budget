// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { PageHeader } from './page-header';
import { restoreControlsFocus } from './controls-focus';

vi.mock('./inbox', () => ({ useInboxCount: () => ({ count: 4, label: 'Prüfen, 4 offen' }) }));
vi.mock('./mobile-chrome', () => ({ MobileProfile: () => <button>Profilmenü</button> }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

it.each(['Heute', 'Plan', 'Konten', 'Vermögen', 'Reports'])(
  '%s retains the same utility slots with optional page controls',
  async (title) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal('scrollTo', () => {});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const toggle = vi.fn();
    const root = createRootRoute({
      component: () => (
        <PageHeader
          title={title}
          controls={title === 'Heute' ? <button>Monatswahl</button> : undefined}
          collapsed={false}
          onToggle={toggle}
          onSearchChange={() => {}}
        />
      ),
    });
    const router = createRouter({
      routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const header = await screen.findByRole('banner');
    expect(header.querySelector('.page-header-title')?.textContent).toBe(title);
    expect(header.querySelectorAll('.page-header-controls')).toHaveLength(1);
    expect(header.querySelector('.page-header-controls')?.textContent).toBe(
      title === 'Heute' ? 'Monatswahl' : '',
    );
    const actions = within(header.querySelector<HTMLElement>('.page-header-actions')!);
    expect(actions.getByRole('link', { name: 'Prüfen, 4 offen' }).getAttribute('href')).toMatch(
      /^\/konten\/pruefen/,
    );
    expect(actions.getByRole('link', { name: 'Buchung' }).getAttribute('href')).toContain(
      'panel=buchung',
    );
    const privacy = actions.getByRole('button', { name: 'Beträge verbergen' });
    fireEvent.click(privacy);
    expect(privacy.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(header).getByRole('button', { name: 'Seitenleiste einklappen' }));
    expect(toggle).toHaveBeenCalledOnce();
  },
);

function Harness({ label }: { label: string }) {
  const [place, setPlace] = useState<'header' | 'body'>('header');
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (place === 'body') restoreControlsFocus(row.current);
  }, [place]);
  const controls = (
    <div className="hv-head">
      <button>{label}</button>
      <button>Zeitraum</button>
    </div>
  );
  return (
    <>
      <PageHeader
        title="Heute"
        controls={controls}
        collapsed={false}
        onToggle={() => {}}
        onSearchChange={() => {}}
        onControlsPlacement={setPlace}
      />
      {place === 'body' && (
        <div className="page-controls-row" ref={row}>
          {controls}
        </div>
      )}
    </>
  );
}

async function mountHarness(label: string) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('scrollTo', () => {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ component: () => <Harness label={label} /> });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole('banner');
  return view;
}

/** jsdom has no layout: the slot is 300px wide and content is 10px per character. */
function stubLayout() {
  const observers: Array<() => void> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList.contains('page-header-controls') ? 300 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return this.classList.contains('page-header-controls')
        ? (this.textContent ?? '').length * 10
        : 0;
    },
  });
  return () => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  };
}

it('re-measures when the controls content grows without the slot resizing', async () => {
  const restore = stubLayout();
  try {
    const view = await mountHarness('Mai');
    const header = screen.getByRole('banner');
    expect(header.querySelector('.page-header-controls button')).not.toBeNull();
    expect(document.querySelector('.page-controls-row')).toBeNull();
    // A longer month name: only the button text changes, the slot box does not.
    await act(async () => {
      screen.getByRole('button', { name: 'Mai' }).textContent = 'Dezember 2026 und mehr Text ....';
      await Promise.resolve();
    });
    expect(header.querySelector('.page-header-controls')?.children).toHaveLength(0);
    expect(document.querySelector('.page-controls-row button')).not.toBeNull();
    view.unmount();
  } finally {
    restore();
  }
});

it('keeps keyboard focus on the same control when the controls move to the body', async () => {
  const restore = stubLayout();
  try {
    const view = await mountHarness('Mai');
    const second = screen.getAllByRole('button', { name: 'Zeitraum' })[0]!;
    second.focus();
    expect(document.activeElement).toBe(second);
    await act(async () => {
      second.previousElementSibling!.textContent = 'Dezember 2026 und mehr Text ....';
      await Promise.resolve();
    });
    const moved = document.querySelector('.page-controls-row')!;
    expect(document.activeElement).toBe(moved.querySelectorAll('button')[1]);
    view.unmount();
  } finally {
    restore();
  }
});
