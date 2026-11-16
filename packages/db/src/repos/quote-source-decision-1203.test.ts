import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { inboxItem } from '../schema';
import { undo } from './audit';
import { createSecurity, getSecurity } from './securities';
import { openStaleValueItem, resolveStaleValueItems } from './market';
import { readInbox } from './inbox';
import { foreignCurrencies } from './market';
import {
  decideQuoteSource,
  setQuoteFxCurrency,
  FETCH_OFF_RESOLUTION,
  MANUAL_ONLY_RESOLUTION,
} from './quote-source-decision';

const ctx = () => ({ actor: 'synthetic-1203' });
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  createSecurity(
    opened.db,
    { id: 's1', name: 'Synthetischer Fonds', kind: 'fund', currency: 'EUR', symbol: 'SYN.DE' },
    ctx(),
  );
  openStaleValueItem(opened.db, {
    title: 'Kurse nicht abrufbar: Synthetischer Fonds',
    detail: 'Fehlerklasse: currency_mismatch',
    refType: 'security',
    refId: 's1',
  });
});
afterEach(() => opened.close());
const items = () => opened.db.select().from(inboxItem).all();

it('switches the fetch off with a reason, closes the warning and is undoable', () => {
  const { resolved, groupId } = decideQuoteSource(
    opened.db,
    's1',
    { mode: 'manual_only', reason: '  Quelle liefert USD  ' },
    '2026-11-16',
    ctx(),
  );
  expect(resolved).toBe(1);
  expect(getSecurity(opened.db, 's1')!.pricesEnabled).toBe(false);
  expect(items()[0]!.resolution).toBe(`${MANUAL_ONLY_RESOLUTION}: Quelle liefert USD`);
  undo(opened.db, { groupId: groupId! }, ctx());
  expect(getSecurity(opened.db, 's1')!.pricesEnabled).toBe(true);
  expect(items()[0]!.resolvedAt).toBeNull();
});

it('allows "Abruf aus" only without holding and requires a reason', () => {
  expect(() =>
    decideQuoteSource(opened.db, 's1', { mode: 'manual_only', reason: ' ' }, '2026-11-16', ctx()),
  ).toThrow(/Grund/);
  decideQuoteSource(
    opened.db,
    's1',
    { mode: 'fetch_off', reason: 'Alt-Bestand' },
    '2026-11-16',
    ctx(),
  );
  expect(items()[0]!.resolution).toBe(`${FETCH_OFF_RESOLUTION}: Alt-Bestand`);
});

it('a later successful fetch still closes a fetch-failure warning by itself (#1101)', () => {
  expect(resolveStaleValueItems(opened.db, 'security', 's1', 'Kursabruf erfolgreich.')).toBe(1);
  expect(items()[0]!.resolution).toMatch(/^Automatisch geschlossen: /);
});

it('stores the owner choice "mit EZB-Kurs umrechnen", asks for its ECB rates, and is undoable (#1203)', () => {
  expect(() => setQuoteFxCurrency(opened.db, 's1', 'EUR', ctx())).toThrow();
  expect(() => setQuoteFxCurrency(opened.db, 's1', 'usd', ctx())).toThrow();
  const { groupId } = setQuoteFxCurrency(opened.db, 's1', 'USD', ctx());
  expect(getSecurity(opened.db, 's1')?.quoteFxCurrency).toBe('USD');
  expect(foreignCurrencies(opened.db)).toContain('USD');
  // The warning stays open until a fetch succeeds.
  expect(items().filter((i) => i.resolvedAt === null)).toHaveLength(1);
  undo(opened.db, { groupId }, ctx());
  expect(getSecurity(opened.db, 's1')?.quoteFxCurrency).toBeNull();
});

it('flags a price-source warning of an instrument without holding as historical (#1203)', () => {
  const entry = readInbox(opened.db, '2026-11-16').entries.find((e) => e.type === 'stored');
  expect(entry).toMatchObject({ kind: 'stale_value', historical: true });
});
