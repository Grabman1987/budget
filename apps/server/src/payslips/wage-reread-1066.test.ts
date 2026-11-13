import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accounts,
  createTestDatabase,
  decidePayslipIntake,
  listPayslipWageReads,
  listPayslips,
  listSalaryPayslips,
  savePayslip,
  schema,
  setPayslipSourceConfig,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { PayslipIntakeService } from './service';
import { syntheticColumnarPayslipPdf, syntheticPayslipPdf, syntheticWageRows } from './testing';

// Synthetic PDFs only (invented employer, wage types and amounts), generated in memory.
let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-wage-reread-'));
  accounts.create(
    opened.db,
    {
      id: 'salary',
      name: 'Synthetisches Konto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 0,
    },
    { actor: 'test' },
  );
  setPayslipSourceConfig(
    opened.db,
    { salaryAccountId: 'salary', wageTypes: {} },
    { actor: 'test' },
  );
});
afterEach(async () => {
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
const service = () => new PayslipIntakeService(opened.db, dir, 'synthetic-pdf-password', undefined);

/** Stage and confirm a PDF; `legacy` strips the #1066 fields as an intake staged before #1066. */
async function capture(bytes: Buffer, name: string, legacy: boolean, password?: string) {
  const staged = await service().ingest(
    bytes,
    name,
    'manual',
    undefined,
    password ? { password } : {},
  );
  if (legacy) {
    const row = opened.db
      .select()
      .from(schema.payslipIntake)
      .where(eq(schema.payslipIntake.id, staged.id))
      .get()!;
    const parsed = JSON.parse(row.parsedJson) as Record<string, unknown>;
    delete parsed['wageLines'];
    delete parsed['statutorySplit'];
    delete parsed['wageLineIssue'];
    opened.sqlite
      .prepare('UPDATE payslip_intake SET parsed_json = ? WHERE id = ?')
      .run(JSON.stringify(parsed), staged.id);
  }
  return decidePayslipIntake(
    opened.db,
    staged.id,
    { action: 'confirm', bookingId: null },
    { actor: 'test' },
  ).payslipId!;
}
/** Every table except the three #1066 tables and the audit log, all columns, rowid order. */
const legacyDump = () =>
  Object.fromEntries(
    (
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('payslip_wage_read','payslip_wage_line','wage_component_mapping','audit_log') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => [
      name,
      opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
const fullDump = () => ({
  ...legacyDump(),
  audit: opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all(),
  reads: opened.sqlite.prepare('SELECT * FROM payslip_wage_read ORDER BY rowid').all(),
  lines: opened.sqlite.prepare('SELECT * FROM payslip_wage_line ORDER BY rowid').all(),
});

describe(
  'wage lines of payslips (#1066)',
  { timeout: process.platform === 'win32' ? 120_000 : 30_000 },
  () => {
    it('stores the full wage lines and the split when a new upload is confirmed', async () => {
      const id = await capture(await syntheticPayslipPdf(), 'synthetic-202609.pdf', false);
      const [read] = listPayslipWageReads(opened.db);
      expect(read).toMatchObject({
        payslipId: id,
        origin: 'intake',
        lineCheck: 'ok',
        svCurrentCents: 70_000,
        svSpecialCents: 0,
        taxCurrentCents: 50_000,
        taxOtherCents: 0,
      });
      expect(read!.lines.map((l) => [l.wageCode, l.section, l.amountCents])).toEqual([
        ['810', 'earning', 400_000],
        ['811', 'reimbursement', 2_500],
        ['812', 'reimbursement', 3_000],
        ['813', 'reimbursement', 4_500],
        [null, 'tax_adjustment', 6_000],
        [null, 'sv_adjustment', 2_000],
        [null, 'deduction', -500],
      ]);
      // The legacy capture is unchanged: header totals and the legacy lines.
      expect(listPayslips(opened.db)[0]).toMatchObject({
        grossCents: 400_000,
        svCents: 70_000,
        taxCents: 50_000,
        netCents: 297_500,
      });
      expect(listPayslips(opened.db)[0]!.lines).toHaveLength(6);
      expect(listSalaryPayslips(opened.db)[0]!.wage?.lines).toHaveLength(7);
    });

    it('re-reads stored payslips only on request: dry run, write, idempotent, undoable', async () => {
      const first = await capture(await syntheticPayslipPdf(), 'synthetic-202609.pdf', true);
      const second = await capture(
        await syntheticColumnarPayslipPdf(),
        'synthetic-203004.pdf',
        true,
      );
      const locked = await capture(
        await syntheticPayslipPdf(
          syntheticWageRows.map((r) =>
            r.replace('09/2026', '10/2026').replace('30.09.2026', '30.10.2026'),
          ),
          'another-synthetic-password',
        ),
        'synthetic-202610.pdf',
        true,
        'another-synthetic-password',
      );
      const manual = savePayslip(
        opened.db,
        {
          month: '2026-11',
          kind: 'regular',
          specialType: null,
          grossCents: 100_000,
          svCents: 10_000,
          taxCents: 5_000,
          netCents: 85_000,
          bookingId: null,
          receiptId: null,
          lines: [],
        },
        { actor: 'test' },
      ).id;
      // An owner correction after capture: the stored net no longer matches the document.
      opened.sqlite
        .prepare('UPDATE payslip SET net_cents = net_cents + 100 WHERE id = ?')
        .run(second);
      expect(listPayslipWageReads(opened.db)).toEqual([]);

      const before = fullDump();
      const dry = await service().rereadWageLines({ dryRun: true, actor: 'owner' });
      expect(fullDump()).toEqual(before);
      const byId = new Map(dry.items.map((i) => [i.payslipId, i]));
      expect(dry.groupId).toBeNull();
      expect(byId.get(first)).toEqual({
        payslipId: first,
        month: '2026-09',
        outcome: 'add',
        lineCount: 7,
        lineCheck: 'ok',
        differences: [],
      });
      expect(byId.get(second)).toMatchObject({
        outcome: 'totals_differ',
        differences: ['net'],
        lineCount: 0,
      });
      expect(byId.get(locked)).toMatchObject({ outcome: 'password', lineCount: 0 });
      expect(byId.get(manual)).toMatchObject({ outcome: 'no_document' });

      const legacyBefore = legacyDump();
      const auditBefore = opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all();
      const run = await service().rereadWageLines({ dryRun: false, actor: 'owner' });
      expect(run.groupId).toEqual(expect.any(String));
      expect(run.items).toEqual(dry.items);
      // Only new rows: every other table and every earlier audit entry is byte-identical.
      expect(legacyDump()).toEqual(legacyBefore);
      const auditAfter = opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all();
      expect(auditAfter.slice(0, auditBefore.length)).toEqual(auditBefore);
      expect(
        (auditAfter.slice(auditBefore.length) as { entity_type: string; group_id: string }[]).map(
          (e) => [e.entity_type, e.group_id === run.groupId],
        ),
      ).toEqual([['payslip_wage_read', true], ...Array(7).fill(['payslip_wage_line', true])]);
      const reads = listPayslipWageReads(opened.db);
      expect(reads.map((r) => [r.payslipId, r.origin, r.lines.length])).toEqual([
        [first, 'reread', 7],
      ]);

      const again = await service().rereadWageLines({ dryRun: false, actor: 'owner' });
      expect(again.groupId).toBeNull();
      expect(again.items.find((i) => i.payslipId === first)?.outcome).toBe('already_read');

      undo(opened.db, { groupId: run.groupId! }, { actor: 'owner' });
      expect(listPayslipWageReads(opened.db)).toEqual([]);
      expect(legacyDump()).toEqual(legacyBefore);
    });
  },
);
