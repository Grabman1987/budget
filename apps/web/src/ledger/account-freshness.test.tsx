// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AccountFreshness } from './account-freshness';

it('names missing sync and review dates explicitly', () => {
  render(<AccountFreshness lastReconciledOn={null} bankBalance={null} />);
  expect(screen.getByText(/Bank-Sync: Nicht eingerichtet/)).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Datenstand' }).textContent).toContain(
    'Kontostand geprüftUnbekannt',
  );
});

it('does not infer a retrieval or review date from a bank observation date', () => {
  render(
    <AccountFreshness
      lastReconciledOn={null}
      bankBalance={{ fetchedAt: null, date: '2026-10-08' }}
    />,
  );
  expect(screen.getByText(/Technischer Abruf: Unbekannt/)).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Datenstand' }).textContent).toContain(
    'Kontostand geprüftUnbekannt',
  );
});

it('keeps the owner review separate from the technical retrieval and bank date', () => {
  render(
    <AccountFreshness
      lastReconciledOn="2026-10-05"
      bankBalance={{ fetchedAt: '2026-10-09T06:30:00Z', date: '2026-10-08' }}
    />,
  );
  expect(screen.getByRole('group', { name: 'Datenstand' }).textContent).toContain(
    'Kontostand geprüft05.10.2026',
  );
  expect(screen.getByText(/Technischer Abruf:/).textContent).toContain('09.10.2026');
  expect(screen.getByText(/Bankstand vom: 08.10.2026/)).toBeTruthy();
});
