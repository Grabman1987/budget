import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { parseStatementText } from '@budget/domain';
import { seedBasics } from './test-helpers';
import {
  findStatementIntake,
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

it.each(['2026-10-01', '2026-11-01'])(
  'flags separate identifier-less sources on the same card on %s without merging them (#1079)',
  (issueDate) => {
    const before = state();
    const make = (sha256: string, day: string) =>
      stageStatementIntake(
        opened.db,
        {
          accountId: 'giro',
          sha256,
          sizeBytes: 50,
          filename: 'synthetic-card.pdf',
          proposal: parseStatementText(
            `Rechnungsdatum ${day}\nAbrechnungsbetrag 120,00 EUR\nKartennummer ****1234`,
            sha256,
          ),
        },
        ctx,
      );
    const first = make('b'.repeat(64), '2026-10-01').intake;
    const facts = {
      reference: null,
      periodFrom: null,
      periodTo: null,
      issueDate: '2026-10-01',
      debitDate: '2026-10-10',
      payableCents: 12000,
      currency: 'EUR',
      accountHint: '****1234',
    };
    const reviewNotes = {
      numberNotPrinted: true,
      periodNotPrinted: true,
      cardReference: 'SYNTHETIC-CARD',
    };
    const reviewed = mutateStatementIntake(
      opened.db,
      first.id,
      first,
      'review',
      { facts, reviewNotes },
      ctx,
    ).intake;
    // A different hash is a separate original even when every fact agrees.
    expect(findStatementIntake(opened.db, 'c'.repeat(64))).toBeUndefined();
    const second = make('c'.repeat(64), issueDate);
    expect(second.duplicate).not.toBe(true);
    expect(second.intake.id).not.toBe(first.id);
    expect(second.intake.receiptId).not.toBe(first.receiptId);
    expect(second.intake.status).toBe('pending');
    expect(second.intake.proposal.relatedIntakeIds).toEqual([first.id]);
    expect(second.intake.proposal.warnings).toContain('possible_amendment');
    expect(findStatementIntake(opened.db, first.sha256)).toEqual(reviewed);
    expect(findStatementIntake(opened.db, second.intake.sha256)).toEqual(second.intake);
    expect(getStatementIntake(opened.db, first.id)).toEqual(reviewed);
    const replay = make('c'.repeat(64), issueDate);
    expect(replay.duplicate).toBe(true);
    expect(replay.groupId).toBeNull();
    expect(replay.intake).toEqual(second.intake);
    expect(opened.db.select().from(statementIntake).all()).toHaveLength(2);
    expect(state()).toBe(before);
  },
);

it.each([true, false])(
  'preserves every reviewed value when reopening (missing identifiers: %s)',
  (missing) => {
    const before = state();
    const first = stage().intake;
    const facts = {
      reference: missing ? null : 'SYNTHETIC-REVIEWED',
      issueDate: '2026-10-02',
      periodFrom: missing ? null : '2026-09-01',
      periodTo: missing ? null : '2026-09-30',
      payableCents: 12345,
      currency: 'CHF',
      debitDate: '2026-10-12',
      accountHint: '****5678',
    };
    const reviewNotes = {
      numberNotPrinted: missing,
      periodNotPrinted: missing,
      cardReference: 'SYNTHETIC-REVIEWED-CARD',
    };
    const reviewed = mutateStatementIntake(
      opened.db,
      first.id,
      first,
      'review',
      { facts, reviewNotes },
      ctx,
    ).intake;
    const pending = mutateStatementIntake(opened.db, first.id, reviewed, 'reopen', {}, ctx).intake;
    expect(pending.status).toBe('pending');
    expect(pending.reviewed).toBeNull();
    expect(pending.proposal).toEqual({ ...first.proposal, draft: facts, reviewNotes });
    expect(getStatementIntake(opened.db, first.id)).toEqual(pending);
    const saved = mutateStatementIntake(
      opened.db,
      first.id,
      pending,
      'review',
      { facts: pending.proposal.draft, reviewNotes: pending.proposal.reviewNotes },
      ctx,
    ).intake;
    expect(saved.reviewed).toEqual(reviewed.reviewed);
    expect(saved.sha256).toBe(first.sha256);
    expect(saved.receiptId).toBe(first.receiptId);
    expect(state()).toBe(before);
  },
);
