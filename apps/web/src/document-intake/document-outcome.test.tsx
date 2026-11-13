// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DocumentOutcome, payslipOutcomeLines, statementOutcomeLines } from './document-outcome';

afterEach(cleanup);
const outcome = (over: object) =>
  ({
    intakeId: 'i',
    runId: 'r',
    groupId: 'g',
    status: 'saved',
    created: 2,
    matched: 1,
    credits: 0,
    receiptLinks: 0,
    pending: [],
    reasons: [],
    suggestedCardTokens: [],
    suggestedCardHints: [],
    ...over,
  }) as never;

it('summarises a saved statement with counts and open rows', () => {
  const lines = statementOutcomeLines(
    outcome({ pending: [{ rowKey: 'a', line: 1, reason: 'x' }] }),
  );
  expect(lines[0]).toBe('Neue Buchungen: 2. Bestehende zugeordnet: 1. Gutschriften: 0.');
  expect(lines[1]).toBe('1 Zeile wartet unter Prüfen.');
});

it('says nothing was booked when a statement only waits for review', () => {
  expect(statementOutcomeLines(null)[0]).toContain('noch nichts gebucht');
  expect(statementOutcomeLines(outcome({ status: 'unchanged' }))[0]).toContain(
    'Bereits vorhandener',
  );
});

it('maps every payslip automation status', () => {
  const text = (status?: 'booked' | 'linked' | 'pruefen' | 'unchanged') =>
    payslipOutcomeLines({
      duplicate: false,
      ...(status ? { automation: { status, reason: '', groupId: null } } : {}),
    })[0];
  expect(text('booked')).toContain('gebucht');
  expect(text('linked')).toContain('verknüpft');
  expect(text('pruefen')).toContain('wartet unter Prüfen');
  expect(text()).toContain('nichts gebucht');
  expect(payslipOutcomeLines({ duplicate: true })[0]).toContain('schon vorhanden');
});

it('links to Prüfen without a router', () => {
  render(<DocumentOutcome typeLabel="Beleg" lines={['Eine Zeile.']} />);
  expect(screen.getByRole('link', { name: 'Zu Prüfen' }).getAttribute('href')).toBe(
    '/konten/pruefen',
  );
  expect(screen.getByText('Eine Zeile.')).toBeTruthy();
});
