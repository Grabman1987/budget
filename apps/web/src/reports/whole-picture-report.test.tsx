// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { WholePicture } from '@budget/db';
import { WholePictureVerdict } from './whole-picture-report';
afterEach(cleanup);
const row: WholePicture['totals'] = {
  month: '2026-09',
  incomeCents: 200000,
  capitalCents: 1000,
  needCents: 68000,
  wantCents: 20000,
  savedCents: 112000,
  savingsRateBp: 5600,
  investmentsInCents: 50000,
  marketCents: -34000,
  principalCents: 10000,
  startCents: 1000000,
  endCents: 1078000,
  deltaCents: 78000,
  otherCents: 0,
};
it('explains the latest full month with signed market verdict and estimated marker', () => {
  render(<WholePictureVerdict row={row} estimated />);
  const text = screen.getByTestId('whole-verdict').textContent?.replace(/\s+/g, ' ');
  // Market sentence plus the rest of the old line: saved amount and net-worth change.
  expect(text).toContain('340 €');
  expect(text).toContain('· Gespart +1.120 € · Nettovermögen +780 € · vorläufig');
  expect(text).not.toMatch(/Markt .*· Markt/);
});
it('shows a positive and neutral market without colour as the only signal', () => {
  const { rerender } = render(<WholePictureVerdict row={{ ...row, marketCents: 1 }} />);
  expect(screen.getByTestId('whole-verdict').textContent).toMatch(/Markt|Marktbewegung/);
  expect(screen.getByTestId('whole-verdict').textContent).toContain('0,01 €');
  rerender(<WholePictureVerdict row={{ ...row, marketCents: 0 }} />);
  expect(screen.getByTestId('whole-verdict').textContent).toContain('1.120 €');
});
