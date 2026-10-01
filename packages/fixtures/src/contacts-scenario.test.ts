import {
  createTestDatabase,
  getContact,
  listContacts,
  netWorthAsOf,
  refreshOccurrences,
} from '@budget/db';
import { describe, expect, it } from 'vitest';
import { sampleLedger } from './ledger/build';
import { withContactsScenario } from './ledger/contacts-scenario';
import { seedDatabase } from './seed';

const TODAY = '2026-09-17';

describe('the parity ledger', () => {
  it('has no contact splits and no Auslagen category: every compared figure stays as it was', () => {
    const ledger = sampleLedger();
    expect(ledger.splits.filter((s) => s.contactId)).toEqual([]);
    expect(ledger.categories.filter((c) => c.kind === 'advance')).toEqual([]);
  });
});

describe('the opt-in contacts scenario', { timeout: 60_000 }, () => {
  const scenario = withContactsScenario(sampleLedger());

  it('adds to a copy and leaves the parity ledger alone', () => {
    expect(scenario).not.toBe(sampleLedger());
    expect(scenario.splits.filter((s) => s.contactId)).toHaveLength(7);
    expect(sampleLedger().splits.filter((s) => s.contactId)).toHaveLength(0);
  });

  it('seeds a database where the contacts have their documented balances', () => {
    const { db } = createTestDatabase();
    seedDatabase(db, scenario);
    refreshOccurrences(db, TODAY);
    const byName = Object.fromEntries(listContacts(db, TODAY).contacts.map((c) => [c.name, c]));
    expect(byName['Kontakt L. Beispiel']).toMatchObject({
      balanceCents: 8_227,
      openCents: 8_227,
      openItemCount: 4,
      expectedPassThroughCents: 1_299,
    });
    expect(byName['Kontakt M. Muster']).toMatchObject({
      balanceCents: 2_750,
      openItemCount: 1,
      expectedContributionCents: 80_000,
    });
    expect(byName['Arbeitgeber']).toMatchObject({ balanceCents: 0 });
    expect(getContact(db, 'con-lena', TODAY).creditCents).toBe(0);
  });

  it('lowers the net worth by exactly the money paid out and not yet repaid', () => {
    const plain = createTestDatabase().db;
    seedDatabase(plain);
    const withScenario = createTestDatabase().db;
    seedDatabase(withScenario, scenario);
    const open = 8_227 + 2_750;
    expect(netWorthAsOf(withScenario, TODAY).totalCents).toBe(
      netWorthAsOf(plain, TODAY).totalCents - open,
    );
  });
});
