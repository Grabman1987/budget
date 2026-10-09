// @vitest-environment jsdom
import { defaultParams, RULE_DEFS } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RuleBook } from './api';
import type * as RulesApi from './api';
import { RulesPage } from './rules-page';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./book-input-form', () => ({ BookInputForm: () => null }));
vi.mock('./rule-panel', () => ({ RulePanel: () => null }));
vi.mock('./api', async (original) => ({
  ...(await original<typeof RulesApi>()),
  evaluateRules: () => new Promise(() => {}),
}));

afterEach(cleanup);

const book: RuleBook = {
  rules: RULE_DEFS.map((def) => ({
    ...def,
    id: def.code,
    enabled: Number(def.code.slice(1)) < 17,
    params: defaultParams(def.code),
    defaults: defaultParams(def.code),
    latest:
      def.code === 'R04'
        ? null
        : {
            asOf: '2026-09-17',
            status: def.code === 'R02' ? 'bad' : def.code === 'R03' ? 'warn' : 'ok',
            valueText: def.code === 'R02' ? '2,5 Monate' : '30 Tage',
            actionNeeded: def.code === 'R02',
            actionText: def.code === 'R02' ? 'Notgroschen aufstocken.' : null,
          },
  })),
  checklist: [
    {
      code: 'S1-1',
      name: 'Nötigste Ausgaben kennen',
      source: null,
      stage: 1,
      enabled: true,
      ruleCode: null,
      confirmedAt: null,
    },
  ],
};

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['rules'], book);
  client.setQueryData(['rules-check'], { stage: { stage: 2 } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RulesPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('puts violations before stages, showing the current value, threshold and correction link', () => {
  show();
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  expect(headings.indexOf('Regeln (22)')).toBeLessThan(headings.indexOf('Stufen'));
  const violated = screen.getByRole('region', { name: 'Verletzt (1)' });
  expect(within(violated).getByText('R02')).toBeTruthy();
  expect(within(violated).getByText('Ist: 2,5 Monate')).toBeTruthy();
  expect(within(violated).getByText('Schwelle: min. 3, Ziel 6 Monate')).toBeTruthy();
  expect(within(violated).getByText('Notgroschen aufstocken.')).toBeTruthy();
  expect(
    within(violated).getByRole('link', { name: 'Im Plan aufstocken' }).getAttribute('href'),
  ).toBe('/plan/monat');
  expect(within(violated).getByRole('switch', { name: 'R02 Notgroschen' })).toBeTruthy();
  expect(screen.getByText('S1-1')).toBeTruthy();
});

it('keeps warnings and unavailable rules out of met rules and hides disabled rules until expanded', async () => {
  const user = userEvent.setup();
  const { container } = show();
  const pending = screen.getByRole('region', { name: 'Noch offen (2)' });
  expect(within(pending).getByText('Warnung')).toBeTruthy();
  expect(within(pending).getByText('Nicht prüfbar: Es fehlen Daten für diese Regel.')).toBeTruthy();
  const met = screen.getByRole('region', { name: 'Eingehalten (13)' });
  expect(within(met).queryByText('R03')).toBeNull();
  expect(within(met).queryByText('R04')).toBeNull();
  const disabled = container.querySelector<HTMLDetailsElement>('.rw-disabled')!;
  expect(disabled.open).toBe(false);
  expect(
    [pending, met, screen.getByRole('region', { name: 'Verletzt (1)' })].flatMap((region) =>
      within(region).getAllByRole('switch'),
    ),
  ).toHaveLength(16);
  await user.click(within(disabled).getByText('Ausgeschaltet (6)'));
  expect(disabled.open).toBe(true);
  expect(screen.getAllByRole('switch', { name: /^R/ })).toHaveLength(22);
  for (const row of container.querySelectorAll('.rw-rules > li')) {
    expect(within(row as HTMLElement).getByRole('button', { name: /^Einstellen R/ })).toBeTruthy();
    expect(row.querySelector('.rw-explanation')?.textContent?.length).toBeGreaterThan(20);
  }
});
