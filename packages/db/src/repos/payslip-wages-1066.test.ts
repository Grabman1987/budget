import { describe, expect, it } from 'vitest';
import { parsePayrollDocument } from '@budget/domain';
import { createTestDatabase } from '../client';
import { contact } from '../schema';
import { createEntity } from './entities';
import { savePayslip } from './payroll-projects';
import {
  applyPayslipWageReread,
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
        [1, 'benefit_in_kind', 20_000],
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
      ).toBeNull();
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
});
