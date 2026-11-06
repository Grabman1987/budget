import { COICOP_CLASSES } from '@budget/domain';
import { expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { cpiMonths, storeCpi } from './cpi';
import { inflationSubindices } from './inflation-report';

it('preserves every byte of the original complete per-class CPI map, including empty classes and month order', () => {
  const opened = createTestDatabase();
  try {
    for (const [i, { code }] of COICOP_CLASSES.slice(0, 2).entries())
      storeCpi(
        opened.db,
        `vpi:${code}`,
        [
          { month: '2026-03', indexMicro: 103_000_001 + i },
          { month: '2026-01', indexMicro: 100_000_000 + i },
          { month: '2026-02', indexMicro: 101_000_003 + i },
        ],
        '2026-04-01T00:00:00Z',
      );
    storeCpi(
      opened.db,
      'unrelated',
      [{ month: '2026-01', indexMicro: 999_000_000 }],
      '2026-04-01T00:00:00Z',
    );
    const legacy = Object.fromEntries(
      COICOP_CLASSES.map((c) => [c.code, cpiMonths(opened.db, `vpi:${c.code}`).months]),
    );
    expect(JSON.stringify(inflationSubindices(opened.db))).toBe(JSON.stringify(legacy));
  } finally {
    opened.close();
  }
});
