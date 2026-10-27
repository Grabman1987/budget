import { createTestDatabase, schema } from '@budget/db';
import type { AssetCompositionPoint } from '@budget/domain';
import { Hono } from 'hono';
import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';

it('keeps the independent8000EUR lead, legacy daily endpoint and every composition date identical', async () => {
  const opened = createTestDatabase();
  try {
    opened.db
      .insert(schema.account)
      .values([
        {
          id: 'asset',
          name: 'Synthetic asset',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-01-01',
          openingBalanceCents: 1_000_000,
        },
        {
          id: 'debt',
          name: 'Synthetic debt',
          type: 'loan',
          role: 'debt',
          onBudget: false,
          openingDate: '2026-01-01',
          openingBalanceCents: -200_000,
        },
      ])
      .run();
    const webDir = mkdtempSync(join(tmpdir(), 'composition550-'));
    writeFileSync(join(webDir, 'index.html'), '<title>Test</title>');
    const auth: AuthGate = {
      originGuard: async (_c, next) => next(),
      requireSession: async (_c, next) => next(),
      requireStepUp: async (_c, next) => next(),
      routes: new Hono(),
    };
    const app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => '2026-03-01' } });
    const res = await app.request('/api/wealth/networth?period=YTD');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      chain: { nowCents: number };
      daily: { date: string; netWorthCents: number }[];
      assetComposition: AssetCompositionPoint;
      assetCompositionHistory: AssetCompositionPoint[];
    };
    expect(body.chain.nowCents).toBe(800_000);
    expect(body.daily.at(-1)).toEqual({ date: '2026-03-01', netWorthCents: 800_000 });
    expect(body.assetComposition).toEqual(body.assetCompositionHistory.at(-1));
    expect(body.assetCompositionHistory.map((p) => p.asOf)).toEqual([
      '2026-01-01',
      '2026-01-31',
      '2026-02-28',
      '2026-03-01',
    ]);
    for (const p of body.assetCompositionHistory) {
      expect(p.totalCents).toBe(800_000);
      expect(p.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(800_000);
      expect(p.groups.find((g) => g.key === 'cash')?.shareBp).toBe(12_500);
      expect(p.groups.find((g) => g.key === 'debt')?.shareBp).toBe(-2_500);
      expect(body.daily.find((d) => d.date === p.asOf)?.netWorthCents).toBe(800_000);
    }
  } finally {
    opened.close();
  }
});
