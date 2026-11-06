import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import type { ParsedPayrollDocument } from '@budget/domain';
import { payslipDocumentMetadata, stagePayslip } from './payslip-intake';
import { readInbox, readInboxCount } from './inbox';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());
const letter: ParsedPayrollDocument = {
  documentType: 'bonus',
  periodSource: null,
  payoutDate: null,
  draft: null,
  differenceCents: null,
  warnings: ['Bonus-Mitteilung: kein Gehaltszettel.'],
};

it('projects filenames for existing inbox letters without inventing a month or changing rows', () => {
  const staged = stagePayslip(
    opened.db,
    {
      sha256: 'a'.repeat(64),
      source: 'dropbox',
      sizeBytes: 100,
      filename: 'Synthetischer Mitarbeiterbonus 2025.pdf',
      parsed: letter,
    },
    { actor: 'test' },
  );
  const before = opened.sqlite.serialize();
  const inbox = readInbox(opened.db, '2026-11-05');
  const item = inbox.entries.find((e) => e.type === 'stored' && e.refId === staged.id);
  expect(item).toMatchObject({
    type: 'stored',
    payslipDocument: {
      originalFilename: 'Synthetischer Mitarbeiterbonus 2025.pdf',
      documentType: 'bonus',
      month: null,
      periodSource: null,
    },
  });
  expect(readInboxCount(opened.db, '2026-11-05').count).toBe(inbox.count);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('labels an unambiguous filename month as filename metadata without creating a payroll draft', () => {
  expect(payslipDocumentMetadata(letter, 'synthetic-202609.pdf')).toMatchObject({
    month: '2026-09',
    periodSource: 'filename',
  });
  expect(letter.draft).toBeNull();
  expect(payslipDocumentMetadata(letter, 'synthetic-202613.pdf').month).toBeNull();
});
it('keeps a parsed month ahead of a conflicting filename and preserves its provenance', () => {
  const parsed = {
    ...letter,
    documentType: 'payslip' as const,
    periodSource: 'content' as const,
    draft: { month: '2026-08' } as NonNullable<ParsedPayrollDocument['draft']>,
  };
  expect(payslipDocumentMetadata(parsed, 'synthetic-202609.pdf')).toMatchObject({
    month: '2026-08',
    periodSource: 'content',
    documentType: 'payslip',
  });
});
