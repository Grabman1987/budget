import { createTestDatabase, listInbox, refreshInbox } from '@budget/db';
import { describe, expect, it } from 'vitest';
import { seedInboxDemo } from './inbox-demo';
import { seedDatabase } from './seed';

const TODAY = '2026-09-17';

describe('the sample ledger and its inbox', () => {
  it('holds only what the ledger itself produces without the demo extras', () => {
    const { db, close } = createTestDatabase();
    seedDatabase(db);
    refreshInbox(db, TODAY);
    const view = listInbox(db, TODAY);
    expect(view.groups.map((g) => g.id)).toEqual(['over']);
    expect(view.groups[0]?.items.map((i) => i.title)).toEqual([
      'Kartenzahlung ist überzogen',
      'Fitnessstudio ist überzogen',
      'Zeitung digital ist überzogen',
      'Friseur und Pflege ist überzogen',
    ]);
    close();
  }, 60_000);

  it('the demo extras fill every group of the prototype', () => {
    const { db, close } = createTestDatabase();
    seedDatabase(db);
    seedInboxDemo(db, TODAY);
    refreshInbox(db, TODAY);
    const view = listInbox(db, TODAY);
    const byGroup = Object.fromEntries(view.groups.map((g) => [g.id, g.items]));
    expect(Object.keys(byGroup)).toEqual([
      'over',
      'uncat',
      'transfer',
      'version',
      'stale',
      'consent',
    ]);
    expect(byGroup['uncat']?.map((i) => [i.title, i.suggestion?.categoryName])).toEqual([
      ['Buchhandlung · −24,90 €', 'Hobby'],
      ['Supermarkt · −41,30 €', 'Lebensmittel'],
      ['Apotheke · −18,60 €', 'Gesundheit'],
      ['Restaurant · −72,50 €', 'Essen gehen'],
    ]);
    expect(byGroup['version']?.map((i) => i.title)).toContain('Strom: neuer Betrag ab August');
    expect(byGroup['stale']?.[0]?.title).toBe('P2P-Kredite: Wert seit 34 Tagen nicht aktualisiert');
    close();
  }, 60_000);
});
