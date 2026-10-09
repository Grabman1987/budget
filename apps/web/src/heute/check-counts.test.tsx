// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Heute } from './api';
import { CheckCounts } from './heute-page';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#rules">{children}</a>,
}));
afterEach(cleanup);

it('visibly accounts for every rule and explains missing inputs without treating them as met', () => {
  const check = { counts: { ok: 0, warn: 1, bad: 2, notEvaluated: 3, total: 6 } } as Exclude<
    Heute['financeCheck'],
    { unavailable: unknown }
  >;
  render(<CheckCounts check={check} date="2026-09-17" />);
  expect(screen.getByText('0 erfüllt')).toBeTruthy();
  expect(screen.getByText('1 Warnung')).toBeTruthy();
  expect(screen.getByText('2 verletzt')).toBeTruthy();
  expect(screen.getByText('3 nicht auswertbar')).toBeTruthy();
  expect(screen.getByText(/Eingangsdaten fehlen/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Fehlende Angaben ansehen' })).toBeTruthy();
});
