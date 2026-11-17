import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { financialTermErrors } from './financial-terms.mjs';

it('every term of the SPEC "Financial terms" table names an exported function', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  expect(financialTermErrors(root)).toEqual([]);
});
