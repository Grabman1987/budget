import { afterEach, beforeEach, expect, it } from 'vitest';
import { PAYSLIP_PARSER_VERSION, type ParsedPayrollDocument } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { undo } from './audit';
import { inboxItem } from '../schema';
import {
  decidePayslipIntake,
  getPayslipIntake,
  listExcludedNonPayslips,
  markIntakeNotAPayslip,
  reincludeNonPayslip,
  stagePayslip,
} from './payslip-intake';

const ctx = { actor: 'synthetic-1203' };
let opened: OpenedDatabase;
const unknown = (): ParsedPayrollDocument => ({
  documentType: 'unknown',
  periodSource: null,
  parserVersion: PAYSLIP_PARSER_VERSION,
  payoutDate: null,
  differenceCents: null,
  warnings: ['Dokumenttyp nicht erkannt.'],
  draft: null,
});
const stage = (sha: string, hash: string, parsed = unknown()) =>
  stagePayslip(
    opened.db,
    {
      sha256: sha,
      contentHash: hash,
      source: 'dropbox',
      sizeBytes: 10,
      filename: 'Synthetische-Broschuere.pdf',
      parsed,
    },
    ctx,
  );
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

it('excludes an unrecognised PDF by content hash, lists it and re-includes it', () => {
  const { id } = stage('a'.repeat(64), 'h1');
  markIntakeNotAPayslip(opened.db, id, '  Werbebroschüre  ', ctx);
  expect(getPayslipIntake(opened.db, id).status).toBe('rejected');
  expect(listExcludedNonPayslips(opened.db)).toMatchObject([
    { id, note: 'Werbebroschüre', originalFilename: 'Synthetische-Broschuere.pdf' },
  ]);
  // A renamed copy (same content hash) is recognised as already known, so it stays excluded.
  expect(stage('b'.repeat(64), 'h1')).toMatchObject({ id, duplicate: true });
  reincludeNonPayslip(opened.db, id, ctx);
  expect(getPayslipIntake(opened.db, id).status).toBe('pending');
  expect(listExcludedNonPayslips(opened.db)).toEqual([]);
  expect(
    opened.db
      .select()
      .from(inboxItem)
      .all()
      .some((i) => i.refId === id && !i.resolvedAt),
  ).toBe(true);
});

it('is undoable and refuses recognised or decided documents', () => {
  const { id } = stage('c'.repeat(64), 'h2');
  const { groupId } = markIntakeNotAPayslip(opened.db, id, null, ctx);
  expect(listExcludedNonPayslips(opened.db)).toMatchObject([{ id, note: null }]);
  undo(opened.db, { groupId: groupId! }, ctx);
  expect(getPayslipIntake(opened.db, id).status).toBe('pending');
  const other = stage('d'.repeat(64), 'h3', { ...unknown(), documentType: 'payslip' });
  expect(() => markIntakeNotAPayslip(opened.db, other.id, null, ctx)).toThrow(/nicht erkannte/);
  decidePayslipIntake(opened.db, id, { action: 'reject', bookingId: null }, ctx);
  expect(() => markIntakeNotAPayslip(opened.db, id, null, ctx)).toThrow(/entschieden/);
  expect(() => reincludeNonPayslip(opened.db, id, ctx)).toThrow();
});
