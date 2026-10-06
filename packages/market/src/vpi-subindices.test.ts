import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { vpiSource } from './vpi';

it('loads recorded synthetic sub-indices with their own base link, ignoring official weights', async () => {
  const source = vpiSource({
    oldUrl: 'https://example.invalid/old',
    newUrl: 'https://example.invalid/new',
    fetch: (async (input: unknown) =>
      new Response(
        readFileSync(
          new URL(
            String(input).endsWith('old')
              ? '../test-data/vpi-subindices-old.csv'
              : '../test-data/vpi-subindices-new.csv',
            import.meta.url,
          ),
          'utf8',
        ),
      )) as never,
  });
  const series = await source.monthlySeries?.();
  expect(series?.['vpi:01.1']).toEqual([
    { month: '2025-12', indexMicro: 130_000_000 },
    { month: '2026-01', indexMicro: 132_000_000 },
  ]);
  expect(series?.['vpi:12.1.3']?.at(-1)?.indexMicro).toBe(121_000_000);
  expect(series?.vpi?.at(-1)?.indexMicro).toBe(118_000_000);
});
