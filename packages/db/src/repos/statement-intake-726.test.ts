import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { parseStatementText } from '@budget/domain';
import { seedBasics } from './test-helpers';
import {
  getStatementIntake,
  mutateStatementIntake,
  stageStatementIntake,
} from './statement-intake';
import { history, undo } from './audit';
import { getReceipt, listReceipts, removeReceipt } from './receipts';
import {
  account,
  auditLog,
  booking,
  bookingSplit,
  expectedPayment,
  expectedPaymentVersion,
  transfer,
  statementIntake,
} from '../schema';
import { eq, sql } from 'drizzle-orm';
let opened: OpenedDatabase;
const ctx = { actor: 'test' };
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const stage = () =>
  stageStatementIntake(
    opened.db,
    {
      accountId: 'giro',
      sha256: 'a'.repeat(64),
      sizeBytes: 50,
      filename: 'synthetic.pdf',
      proposal: parseStatementText(
        'Rechnungsdatum 01.10.2026\nAbrechnungsbetrag 120,00 EUR',
        'a'.repeat(64),
      ),
    },
    ctx,
  );
const state = () =>
  JSON.stringify(
    [account, booking, bookingSplit, transfer, expectedPayment, expectedPaymentVersion].map((t) =>
      opened.db.all(sql`SELECT * FROM ${t} ORDER BY rowid`),
    ),
  );
it('guards generic receipt list/removal and forced partial creation undo; grouped undo/redo is safe and refreshes revision', () => {
  const before = state(),
    s = stage(),
    r = s.intake;
  expect(listReceipts(opened.db)).toEqual([]);
  expect(() => removeReceipt(opened.db, r.receiptId, ctx)).toThrow();
  const receiptEntry = history(opened.db, 'receipt', r.receiptId)[0]!;
  expect(() => undo(opened.db, { auditId: receiptEntry.id }, ctx, { force: true })).toThrow();
  const reversed = undo(opened.db, { groupId: s.groupId! }, ctx);
  expect(getStatementIntake(opened.db, r.id).deletedAt).not.toBeNull();
  undo(opened.db, { groupId: reversed.groupId }, ctx);
  const current = getStatementIntake(opened.db, r.id);
  expect(current.deletedAt).toBeNull();
  expect(current.revision).not.toBe(r.revision);
  expect(() => mutateStatementIntake(opened.db, r.id, r, 'reject', {}, ctx)).toThrow();
  expect(state()).toBe(before);
});
it('stale writes are atomic, same current pending draft is no-op, reject retains source and reopen is explicit', () => {
  const r = stage().intake,
    before = state();
  const facts = {
    reference: 'SYNTHETIC',
    issueDate: '2026-10-01',
    periodFrom: null,
    periodTo: null,
    payableCents: 12000,
    currency: 'EUR',
    debitDate: null,
    accountHint: null,
  };
  const draft = mutateStatementIntake(
    opened.db,
    r.id,
    r,
    'review',
    { facts, savePending: true },
    ctx,
  );
  expect(draft.intake.reviewed).toBeNull();
  expect(draft.intake.proposal.draft).toEqual(facts);
  expect(
    mutateStatementIntake(
      opened.db,
      r.id,
      draft.intake,
      'review',
      { facts, savePending: true },
      ctx,
    ).groupId,
  ).toBeNull();
  const count = opened.db.select().from(auditLog).all().length;
  expect(() => mutateStatementIntake(opened.db, r.id, r, 'review', { facts }, ctx)).toThrow();
  expect(opened.db.select().from(auditLog).all()).toHaveLength(count);
  const rejected = mutateStatementIntake(opened.db, r.id, draft.intake, 'reject', {}, ctx).intake;
  expect(getReceipt(opened.db, rejected.receiptId).sha256).toBe(r.sha256);
  expect(() =>
    mutateStatementIntake(opened.db, r.id, rejected, 'reparse', { proposal: r.proposal }, ctx),
  ).toThrow();
  expect(mutateStatementIntake(opened.db, r.id, rejected, 'reopen', {}, ctx).intake.status).toBe(
    'pending',
  );
  expect(state()).toBe(before);
});
it('grouped delete/restore retains source SHA and rejects partial intake restore onto deleted receipt', () => {
  const r = stage().intake,
    deleted = mutateStatementIntake(opened.db, r.id, r, 'delete', {}, ctx);
  expect(
    mutateStatementIntake(opened.db, r.id, deleted.intake, 'delete', {}, ctx).groupId,
  ).toBeNull();
  expect(() => getReceipt(opened.db, r.receiptId)).toThrow();
  const entry = history(opened.db, 'statement_intake', r.id)[0]!;
  expect(() => undo(opened.db, { auditId: entry.id }, ctx, { force: true })).toThrow();
  const restored = mutateStatementIntake(opened.db, r.id, deleted.intake, 'restore', {}, ctx);
  expect(restored.intake.deletedAt).toBeNull();
  expect(getReceipt(opened.db, r.receiptId).sha256).toBe(r.sha256);
});

it('acknowledges identical reviewed facts at the current revision without an audit write while stale replay still conflicts', () => {
  const r = stage().intake;
  const facts = {
    reference: 'SYNTHETIC',
    issueDate: '2026-10-01',
    periodFrom: null,
    periodTo: null,
    payableCents: 12000,
    currency: 'EUR',
    debitDate: '2026-10-10',
    accountHint: null,
  };
  const saved = mutateStatementIntake(opened.db, r.id, r, 'review', { facts }, ctx).intake;
  const count = opened.db.select().from(auditLog).all().length;
  expect(
    mutateStatementIntake(opened.db, r.id, saved, 'review', { facts }, ctx).groupId,
  ).toBeNull();
  expect(opened.db.select().from(auditLog).all()).toHaveLength(count);
  expect(() => mutateStatementIntake(opened.db, r.id, r, 'review', { facts }, ctx)).toThrow();
});

it('finds a possible amendment in full account history beyond the recent fifty-row UI list', () => {
  const first = stage().intake;
  const make = (n: number, reference: string) =>
    stageStatementIntake(
      opened.db,
      {
        accountId: 'giro',
        sha256: n.toString(16).padStart(64, '0'),
        sizeBytes: 20,
        filename: 'synthetic.pdf',
        proposal: parseStatementText(
          `Rechnungsnummer: ${reference}`,
          n.toString(16).padStart(64, '0'),
        ),
      },
      ctx,
    ).intake;
  const original = make(1, 'OLDEST');
  opened.db
    .update(statementIntake)
    .set({ createdAt: '2020-01-01T00:00:00Z' })
    .where(eq(statementIntake.id, original.id))
    .run();
  for (let n = 2; n <= 51; n++) make(n, `OTHER-${n}`);
  const amended = make(52, 'OLDEST');
  expect(amended.proposal.relatedIntakeIds).toEqual([original.id]);
  expect(amended.proposal.warnings).toContain('possible_amendment');
  expect(amended.id).not.toBe(first.id);
});
it('matches the same printed non-ASCII reference without relying on SQLite Unicode case folding', () => {
  const make = (n: number) =>
    stageStatementIntake(
      opened.db,
      {
        accountId: 'giro',
        sha256: n.toString(16).padStart(64, '0'),
        sizeBytes: 20,
        filename: 'synthetic.pdf',
        proposal: parseStatementText('Rechnungsnummer: Ö-01', n.toString(16).padStart(64, '0')),
      },
      ctx,
    ).intake;
  const first = make(91),
    amendment = make(92);
  expect(amendment.proposal.relatedIntakeIds).toEqual([first.id]);
  expect(amendment.proposal.warnings).toContain('possible_amendment');
});
