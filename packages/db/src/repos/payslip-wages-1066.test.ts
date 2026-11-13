import { describe, expect, it } from 'vitest';
import { parsePayrollDocument, type ParsedPayrollDocument } from '@budget/domain';
import { createTestDatabase } from '../client';
import { contact } from '../schema';
import { createEntity } from './entities';
import { savePayslip } from './payroll-projects';
import { stagePayslip, decidePayslipIntake } from './payslip-intake';
import { deletePayslip, listPayslips } from './payroll-projects';
import {
  applyPayslipWageReread,
  listSalaryPayslips,
  deleteWageComponentMapping,
  listPayslipWageReads,
  listWageComponentMappings,
  saveWageComponentMapping,
  storePayslipWageRead,
  wageComponentRules,
} from './payslip-wages';
import { undo } from './audit';

// Synthetic text only; invented wage types and amounts.
const text = [
  'Lohnart Abrechnung',
  'Abrechnungsmonat: 03/2027',
  '810 Grundgehalt 3.000,00',
  '820 Sachbezug Dienstwagen 200,00',
  'Brutto 3.200,00',
  'SV-DN laufend 600,00',
  'LSt laufend 400,00',
  'Sonstige Abzüge 200,00',
  'Auszahlung 2.000,00',
].join('\n');
const parsed = parsePayrollDocument(text, 'synthetic.pdf', {
  salaryAccountId: null,
  wageTypes: {},
});

describe('wage repositories (#1066)', () => {
  it('stores one reading per payslip and skips a payslip changed since planning', () => {
    const opened = createTestDatabase();
    try {
      const slip = savePayslip(
        opened.db,
        { ...parsed.draft!, lines: parsed.draft!.lines },
        {
          actor: 'test',
        },
      );
      expect(
        applyPayslipWageReread(
          opened.db,
          [{ payslip: { ...slip, netCents: slip.netCents + 1, receiptId: null }, parsed }],
          { actor: 'owner' },
        ),
      ).toEqual({ groupId: null, written: [], skipped: [slip.id] });
      const applied = applyPayslipWageReread(
        opened.db,
        [{ payslip: { ...slip, receiptId: null }, parsed }],
        { actor: 'owner' },
      );
      expect(applied.written).toEqual([slip.id]);
      const [read] = listPayslipWageReads(opened.db);
      expect(read).toMatchObject({ origin: 'reread', lineCheck: 'ok', svCurrentCents: 60_000 });
      expect(read!.lines.map((l) => [l.lineOrder, l.section, l.amountCents])).toEqual([
        [0, 'earning', 300_000],
        [1, 'earning', 20_000],
        [2, 'deduction', -20_000],
      ]);
      expect(
        storePayslipWageRead(
          opened.db,
          slip.id,
          parsed,
          { origin: 'reread', receiptId: null },
          {
            actor: 'owner',
          },
        ),
      ).toEqual({ status: 'unchanged' });
    } finally {
      opened.close();
    }
  });

  it('keeps owner component mappings unique per key, audited and undoable', () => {
    const opened = createTestDatabase();
    try {
      const employer = createEntity(
        opened.db,
        contact,
        { name: 'Beispiel GmbH' },
        { actor: 'test' },
      );
      const a = saveWageComponentMapping(
        opened.db,
        { employerContactId: null, wageCode: '810', label: null, component: 'base' },
        { actor: 'owner' },
      );
      const b = saveWageComponentMapping(
        opened.db,
        {
          employerContactId: employer.id,
          wageCode: null,
          label: ' *Sachbezug  Dienstwagen',
          component: 'benefit_in_kind',
        },
        { actor: 'owner' },
      );
      // Same key again changes the component of the existing row.
      const c = saveWageComponentMapping(
        opened.db,
        { employerContactId: null, wageCode: '810', label: null, component: 'variable' },
        { actor: 'owner' },
      );
      expect(c.id).toBe(a.id);
      const rules = wageComponentRules(opened.db);
      expect(rules).toHaveLength(2);
      expect(rules).toContainEqual({
        employerContactId: null,
        wageCode: '810',
        labelNorm: null,
        component: 'variable',
      });
      expect(rules).toContainEqual({
        employerContactId: employer.id,
        wageCode: null,
        labelNorm: 'sachbezug dienstwagen',
        component: 'benefit_in_kind',
      });
      undo(opened.db, { groupId: c.groupId }, { actor: 'owner' });
      expect(listWageComponentMappings(opened.db).find((m) => m.id === a.id)?.component).toBe(
        'base',
      );
      deleteWageComponentMapping(opened.db, b.id, { actor: 'owner' });
      expect(listWageComponentMappings(opened.db).map((m) => m.id)).toEqual([a.id]);
      expect(() =>
        saveWageComponentMapping(
          opened.db,
          { employerContactId: null, wageCode: null, label: '  ', component: 'base' },
          { actor: 'owner' },
        ),
      ).toThrow('Bitte Lohnart-Nummer oder Bezeichnung angeben.');
    } finally {
      opened.close();
    }
  });

  it('#1082-7 normalises lines; a confirm never fails because of wage lines', () => {
    const opened = createTestDatabase();
    try {
      const odd: ParsedPayrollDocument = {
        ...parsed,
        wageLines: [
          { ...parsed.wageLines![0]!, order: 5, label: 'X'.repeat(200), referenceMonth: '2030-13' },
          { ...parsed.wageLines![1]!, order: 5, label: '  ', section: 'bogus' as never },
        ],
      };
      const stage = (document: ParsedPayrollDocument, sha: string) =>
        stagePayslip(
          opened.db,
          {
            sha256: sha.repeat(64),
            source: 'manual',
            sizeBytes: 100,
            filename: 'synthetic.pdf',
            parsed: document,
          },
          { actor: 'test' },
        ).id;
      const confirm = (id: string) =>
        decidePayslipIntake(
          opened.db,
          id,
          { action: 'confirm', bookingId: null },
          { actor: 'test' },
        );
      const first = confirm(stage(odd, 'a'));
      const [read] = listPayslipWageReads(opened.db);
      expect(read).toMatchObject({ payslipId: first.payslipId, lineCheck: 'ok' });
      expect(JSON.parse(read!.issues!)).toEqual([
        'label_truncated',
        'order_renumbered',
        'reference_month_dropped',
        'label_missing',
        'section_unknown',
      ]);
      expect(
        read!.lines.map((l) => [
          l.lineOrder,
          Array.from(l.label).length,
          l.referenceMonth,
          l.section,
        ]),
      ).toEqual([
        [0, 160, null, 'earning'],
        [1, 11, null, 'unknown'],
      ]);
      expect(read!.lines[1]!.label).toBe('Lohnart 820');

      // An amount that is not whole cents: the confirm succeeds, the reading records the skip.
      const second = confirm(
        stage(
          {
            ...parsed,
            draft: { ...parsed.draft!, month: '2027-04' },
            wageLines: [{ ...parsed.wageLines![0]!, amountCents: 1.5 }],
          },
          'b',
        ),
      );
      const skippedRead = listPayslipWageReads(opened.db).find(
        (r) => r.payslipId === second.payslipId,
      )!;
      expect(skippedRead).toMatchObject({
        lineCheck: 'skipped',
        issues: '["amount_invalid"]',
        lines: [],
      });

      // Any remaining write error: skipped with a reason, the confirm itself is committed.
      opened.sqlite.exec(
        "CREATE TRIGGER synthetic_wage_failure BEFORE INSERT ON payslip_wage_line BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
      );
      const third = confirm(
        stage({ ...parsed, draft: { ...parsed.draft!, month: '2027-05' } }, 'c'),
      );
      expect(third.payslipId).toEqual(expect.any(String));
      expect(
        listPayslips(opened.db)
          .map((p) => p.month)
          .sort(),
      ).toEqual(['2027-03', '2027-04', '2027-05']);
      const failed = listPayslipWageReads(opened.db).find((r) => r.payslipId === third.payslipId)!;
      expect(failed).toMatchObject({ lineCheck: 'skipped', issues: '["write_failed"]', lines: [] });
      opened.sqlite.exec('DROP TRIGGER synthetic_wage_failure');

      // A later re-read replaces a skipped reading.
      const slip = listPayslips(opened.db).find((p) => p.id === third.payslipId)!;
      const replaced = applyPayslipWageReread(
        opened.db,
        [{ payslip: slip, parsed: { ...parsed, draft: { ...parsed.draft!, month: '2027-05' } } }],
        { actor: 'owner' },
      );
      expect(replaced.written).toEqual([third.payslipId]);
      expect(
        listPayslipWageReads(opened.db).find((r) => r.payslipId === third.payslipId),
      ).toMatchObject({ lineCheck: 'ok', origin: 'reread' });
      expect(listSalaryPayslips(opened.db).find((p) => p.id === second.payslipId)?.wage).toBeNull();
    } finally {
      opened.close();
    }
  });

  it('#1082-8 an edit of the header totals retires the reading; deleting the payslip too', () => {
    const opened = createTestDatabase();
    try {
      const slip = savePayslip(
        opened.db,
        { ...parsed.draft!, lines: parsed.draft!.lines },
        { actor: 'test' },
      );
      applyPayslipWageReread(opened.db, [{ payslip: { ...slip, receiptId: null }, parsed }], {
        actor: 'owner',
      });
      // Editing only a line label keeps the reading.
      savePayslip(
        opened.db,
        {
          ...parsed.draft!,
          lines: parsed.draft!.lines.map((l) => ({ ...l, label: `${l.label} (neu)` })),
        },
        { actor: 'test' },
        slip.id,
      );
      expect(listPayslipWageReads(opened.db)).toHaveLength(1);
      const edit = savePayslip(
        opened.db,
        { ...parsed.draft!, grossCents: 330_000, netCents: 210_000 },
        { actor: 'owner', groupId: 'synthetic-edit' },
        slip.id,
      );
      expect(edit.grossCents).toBe(330_000);
      expect(listPayslipWageReads(opened.db)).toEqual([]);
      const retired = opened.sqlite
        .prepare(
          "SELECT entity_type, action FROM audit_log WHERE group_id = 'synthetic-edit' AND entity_type LIKE 'payslip_wage%'",
        )
        .all();
      expect(retired).toEqual([
        { entity_type: 'payslip_wage_line', action: 'delete' },
        { entity_type: 'payslip_wage_line', action: 'delete' },
        { entity_type: 'payslip_wage_line', action: 'delete' },
        { entity_type: 'payslip_wage_read', action: 'delete' },
      ]);
      // The re-read can rebuild it against the new totals.
      const rebuilt = applyPayslipWageReread(
        opened.db,
        [{ payslip: { ...edit, receiptId: null }, parsed }],
        { actor: 'owner' },
      );
      expect(rebuilt.written).toEqual([slip.id]);
      deletePayslip(opened.db, slip.id, { actor: 'owner' });
      expect(listPayslipWageReads(opened.db)).toEqual([]);
    } finally {
      opened.close();
    }
  });

  it('#1082-9 a single wage entry cannot be undone, the whole re-read can', () => {
    const opened = createTestDatabase();
    try {
      const slip = savePayslip(
        opened.db,
        { ...parsed.draft!, lines: parsed.draft!.lines },
        { actor: 'test' },
      );
      const { groupId } = applyPayslipWageReread(
        opened.db,
        [{ payslip: { ...slip, receiptId: null }, parsed }],
        { actor: 'owner' },
      );
      const ids = opened.sqlite
        .prepare('SELECT id, entity_type FROM audit_log WHERE group_id = ? ORDER BY rowid')
        .all(groupId) as { id: string; entity_type: string }[];
      for (const entry of [ids[0]!, ids.at(-1)!])
        expect(() => undo(opened.db, { auditId: entry.id }, { actor: 'owner' })).toThrow(
          'Gehaltszeilen nur als gesamte Aktion rückgängig machen.',
        );
      expect(listPayslipWageReads(opened.db)[0]!.lines).toHaveLength(3);
      undo(opened.db, { groupId: groupId! }, { actor: 'owner' });
      expect(listPayslipWageReads(opened.db)).toEqual([]);
    } finally {
      opened.close();
    }
  });
});
