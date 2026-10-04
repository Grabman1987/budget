import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTestDatabase,
  getPayslipIntake,
  history,
  readPayslipPasswordCiphertext,
  type OpenedDatabase,
} from '@budget/db';
import { forgetPayslipPassword, payslipPasswordSource } from './password';
import { PayslipIntakeService } from './service';
import { syntheticPayslipPdf, syntheticWageRows } from './testing';

const PEPPER = 'synthetic-pepper-0123456789abcdef-synthetic';
let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  vi.stubEnv('BUDGET_PEPPER', PEPPER);
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', '');
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-pwd-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
// No server password and no write-back target unless a test says otherwise.
const service = (serverPassword?: string) =>
  new PayslipIntakeService(opened.db, dir, serverPassword, undefined);
const pdf = (password: string, month = '09/2026') =>
  syntheticPayslipPdf(
    syntheticWageRows.map((row) =>
      row.startsWith('Abrechnungsmonat') ? `Abrechnungsmonat: ${month}` : row,
    ),
    password,
  );
const warnings = (id: string) => getPayslipIntake(opened.db, id).parsed.warnings;
const dumped = (secret: string) => opened.sqlite.serialize().includes(Buffer.from(secret));

describe('PDF password entered in the app', { timeout: 60_000 }, () => {
  it('remembers an opening password as ciphertext only, never as plaintext', async () => {
    const out = vi.spyOn(console, 'log'),
      err = vi.spyOn(console, 'error'),
      warn = vi.spyOn(console, 'warn');
    const staged = await service().ingest(
      await pdf('synthetic-typed-1'),
      'a.pdf',
      'manual',
      undefined,
      {
        password: 'synthetic-typed-1',
        remember: true,
      },
    );
    expect(staged).toMatchObject({ duplicate: false, passwordRemember: 'saved' });
    expect(warnings(staged.id!)).toEqual([]);
    expect(readPayslipPasswordCiphertext(opened.db)).toMatch(/^v1:/);
    expect(payslipPasswordSource(opened.db)).toBe('app');
    expect(dumped('synthetic-typed-1')).toBe(false);
    for (const spy of [out, err, warn]) expect(spy).not.toHaveBeenCalled();
    // The audit trail names the event but carries neither value nor ciphertext.
    const trail = JSON.stringify(history(opened.db, 'payslip_secret', 'pdf-password'));
    expect(trail).toContain('create');
    expect(trail).not.toContain(readPayslipPasswordCiphertext(opened.db));
    // A later upload needs no password at all.
    const later = await service().ingest(
      await pdf('synthetic-typed-1', '08/2026'),
      'b.pdf',
      'manual',
    );
    expect(warnings(later.id!)).toEqual([]);
  });
  it('does not remember without the checkbox, on a wrong password, or for an unencrypted PDF', async () => {
    const a = await service().ingest(await pdf('synthetic-typed-2'), 'a.pdf', 'manual', undefined, {
      password: 'synthetic-typed-2',
    });
    expect(a.passwordRemember).toBe('off');
    const wrong = await service().ingest(
      await pdf('synthetic-typed-3', '08/2026'),
      'b.pdf',
      'manual',
      undefined,
      {
        password: 'synthetic-wrong',
        remember: true,
      },
    );
    expect(wrong.passwordRemember).toBe('not_opened');
    expect(warnings(wrong.id!)[0]).toMatch(/PDF-Passwort falsch/);
    const plain = await syntheticPayslipPdf(
      syntheticWageRows.map((r) =>
        r.startsWith('Abrechnungsmonat') ? 'Abrechnungsmonat: 07/2026' : r,
      ),
      undefined,
    );
    const open = await service().ingest(plain, 'c.pdf', 'manual', undefined, {
      password: 'synthetic-unneeded',
      remember: true,
    });
    expect(open.passwordRemember).toBe('not_opened');
    expect(readPayslipPasswordCiphertext(opened.db)).toBeNull();
    expect(dumped('synthetic-wrong')).toBe(false);
  });
  it('disables remembering with a clear status when BUDGET_PEPPER is missing', async () => {
    vi.stubEnv('BUDGET_PEPPER', '');
    const staged = await service().ingest(
      await pdf('synthetic-typed-4'),
      'a.pdf',
      'manual',
      undefined,
      {
        password: 'synthetic-typed-4',
        remember: true,
      },
    );
    expect(staged.passwordRemember).toBe('unavailable');
    expect(warnings(staged.id!)).toEqual([]);
    expect(readPayslipPasswordCiphertext(opened.db)).toBeNull();
  });
  it('tries the typed password, then the remembered one, then the server secret', async () => {
    await service().ingest(await pdf('synthetic-app'), 'seed.pdf', 'manual', undefined, {
      password: 'synthetic-app',
      remember: true,
    });
    const server = service('synthetic-server');
    // typed password wins even though a remembered and a server password exist
    const typed = await server.ingest(
      await pdf('synthetic-typed', '01/2026'),
      'a.pdf',
      'manual',
      undefined,
      {
        password: 'synthetic-typed',
      },
    );
    expect(warnings(typed.id!)).toEqual([]);
    // wrong typed password falls through to the remembered password
    const remembered = await server.ingest(
      await pdf('synthetic-app', '02/2026'),
      'b.pdf',
      'manual',
      undefined,
      {
        password: 'synthetic-wrong',
      },
    );
    expect(warnings(remembered.id!)).toEqual([]);
    // finally the server secret
    const fromServer = await server.ingest(
      await pdf('synthetic-server', '03/2026'),
      'c.pdf',
      'manual',
    );
    expect(warnings(fromServer.id!)).toEqual([]);
    // nothing matches: visible warning that asks for a new password
    const none = await server.ingest(await pdf('synthetic-other', '04/2026'), 'd.pdf', 'manual');
    expect(warnings(none.id!)[0]).toMatch(/PDF-Passwort falsch.*neu eingeben/);
  });
  it('lets "Erneut auswerten" take a newly entered password and remember it', async () => {
    const staged = await service().ingest(await pdf('synthetic-late'), 'a.pdf', 'manual');
    expect(warnings(staged.id!)[0]).toMatch(/PDF-Passwort fehlt/);
    const retried = await service().retry(staged.id!, {
      password: 'synthetic-late',
      remember: true,
    });
    expect(retried.passwordRemember).toBe('saved');
    expect(warnings(staged.id!)).toEqual([]);
    expect(dumped('synthetic-late')).toBe(false);
  });
  it('forgets the stored ciphertext with a value-free audit entry', async () => {
    await service().ingest(await pdf('synthetic-forget'), 'a.pdf', 'manual', undefined, {
      password: 'synthetic-forget',
      remember: true,
    });
    expect(forgetPayslipPassword(opened.db)).toBe(true);
    expect(forgetPayslipPassword(opened.db)).toBe(false);
    expect(readPayslipPasswordCiphertext(opened.db)).toBeNull();
    expect(payslipPasswordSource(opened.db)).toBeNull();
    const trail = history(opened.db, 'payslip_secret', 'pdf-password');
    expect(trail.map((e) => e.action)).toEqual(['delete', 'create']);
    expect(JSON.stringify(trail)).not.toContain('v1:');
    expect(dumped('synthetic-forget')).toBe(false);
    const after = await service().ingest(
      await pdf('synthetic-forget', '05/2026'),
      'b.pdf',
      'manual',
    );
    expect(warnings(after.id!)[0]).toMatch(/PDF-Passwort fehlt/);
  });
  it('reports the server secret as source when nothing is stored in the app', () => {
    vi.stubEnv('PAYSLIP_PDF_PASSWORD', 'synthetic-server');
    expect(payslipPasswordSource(opened.db)).toBe('server');
  });
});
