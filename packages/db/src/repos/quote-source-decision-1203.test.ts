import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { inboxItem } from '../schema';
import { undo } from './audit';
import { createSecurity, getSecurity } from './securities';
import { openStaleValueItem, resolveStaleValueItems } from './market';
import {
  decideQuoteSource,
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
