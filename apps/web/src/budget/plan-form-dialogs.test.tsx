// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CategoryPanel } from './category-panel';
import { GoalPanel } from './goals-panel';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['category', 'goal'] as const)(
  '%s input opens a centred desktop form with an explicit cancel control',
  (kind) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          {kind === 'category' ? (
            <CategoryPanel
              state={{ mode: 'group' }}
              tree={{ groups: [], categories: [], targets: [] }}
              onClose={onClose}
              onSwitch={() => {}}
            />
          ) : (
            <GoalPanel
              month="2026-09"
              state={{ mode: 'create' }}
              goal={undefined}
              categories={[]}
              groups={[]}
              accounts={[]}
              onClose={onClose}
            />
          )}
        </ToastProvider>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('modal')).toBe(true);
    expect(dialog.classList.contains('panel')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Schließen$/ }));
    expect(onClose).toHaveBeenCalledOnce();
  },
);
