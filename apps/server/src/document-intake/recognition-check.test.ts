import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const cli = fileURLToPath(new URL('./recognition-check.ts', import.meta.url));
const fixtures = fileURLToPath(
  new URL('../../../../packages/fixtures/recognition', import.meta.url),
);

function run(...args: string[]) {
  const child = spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PAYSLIP_PDF_PASSWORD: 'synthetic-pdf-password' },
    timeout: 25_000,
  });
  if (child.error) throw child.error;
  return child;
}

it('checks the public documents through the CLI, excluding encrypted PDFs from accuracy', () => {
  const result = run('--dir', fixtures);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(
    '"document":"encrypted.pdf","type":"payslip","skipped":"encrypted"',
  );
  expect(result.stdout).toContain(
    '"field":"summary.debitDate","expected":"2031-01-12","actual":"2031-01-12","pass":true',
  );
  expect(result.stdout).toContain(
    '"field":"rows.0.amountCents","expected":-7001,"actual":-7001,"pass":true',
  );
  expect(result.stdout).toContain(
    '"field":"draft.netCents","expected":297500,"actual":297500,"pass":true',
  );
  expect(result.stdout).toContain(
    '"field":"bookingMatches","expected":["matching-payee","nearer"],"actual":["matching-payee","nearer"],"pass":true',
  );
  expect(result.stdout).toContain('"type":"payslip","typePassed":1,"typeTotal":1');
}, 30_000);

it('reports a one-cent mismatch with field and type accuracy, leaving the input untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-recognition-'));
  try {
    cpSync(join(fixtures, 'credit-note.pdf'), join(dir, 'credit-note.pdf'));
    const sidecar = join(dir, 'credit-note.expected.json');
    const expected = JSON.stringify({
      type: 'receipt',
      fields: { totalCents: -1241, date: '2026-10-07' },
    });
    writeFileSync(sidecar, expected);
    const result = run('--dir', dir);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain(
      '"field":"totalCents","expected":-1241,"actual":-1240,"pass":false',
    );
    expect(result.stdout).toContain('"fieldPassed":1,"fieldTotal":2,"fieldAccuracy":0.5');
    expect(result.stdout).toContain('"typePassed":1,"typeTotal":1,"typeAccuracy":1');
    expect(readFileSync(sidecar, 'utf8')).toBe(expected);
    expect(readdirSync(dir).sort()).toEqual(['credit-note.expected.json', 'credit-note.pdf']);

    writeFileSync(sidecar, JSON.stringify({ type: 'unreadable', fields: {} }));
    const wrongType = run('--dir', dir);
    expect(wrongType.status).toBe(1);
    expect(wrongType.stdout).toContain(
      '"field":"documentType","expected":"unreadable","actual":"receipt","pass":false',
    );
    expect(wrongType.stdout).toContain('"typePassed":0,"typeTotal":1,"typeAccuracy":0');

    writeFileSync(sidecar, JSON.stringify({ type: 'receipt', fields: { totalCents: -12.4 } }));
    expect(run('--dir', dir).status).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it('rejects invalid arguments', () => {
  expect(run('--dir').status).toBe(2);
});
