import { describe, expect, it } from 'vitest';
import { averageCost, fifoCost } from './invest';
import type { CostMethod } from './cost';
import {
  replaySecurityTransfers,
  securityTransferScopeFlow,
  type SecurityReplayEvent,
  type SecurityReplayInput,
  type SecurityReplayResult,
} from './security-transfer-replay';

type Acquisition = Extract<SecurityReplayEvent, { kind: 'acquisition' }>;
type Transfer = Extract<SecurityReplayEvent, { kind: 'transfer' }>;
const acquisition = (patch: Partial<Acquisition> = {}): Acquisition => ({
  kind: 'acquisition',
  id: 'lot-1',
  date: '2025-01-01',
  sequence: 1,
  securityId: 'security-1',
  currency: 'EUR',
  accountId: 'source',
  unitsE8: 400_000_000,
  basisCents: 4_000,
  ...patch,
});
const pair = (
  id = 'pair-1',
  date = '2025-03-01',
  unitsE8 = 500_000_000,
  source = 'source',
  destination = 'destination',
  sequence = 1,
): Transfer => ({
  kind: 'transfer',
  id,
  date,
  sequence,
  securityId: 'security-1',
  currency: 'EUR',
  outgoing: {
    id: `${id}-out`,
    date,
    accountId: source,
    unitsE8: -unitsE8,
    securityId: 'security-1',
    currency: 'EUR',
  },
  incoming: {
    id: `${id}-in`,
    date,
    accountId: destination,
    unitsE8,
    securityId: 'security-1',
    currency: 'EUR',
  },
});
const sale = (
  patch: Partial<Extract<SecurityReplayEvent, { kind: 'sale' }>> = {},
): SecurityReplayEvent => ({
  kind: 'sale',
  id: 'sale-1',
  date: '2025-04-01',
  sequence: 1,
  securityId: 'security-1',
  currency: 'EUR',
  accountId: 'destination',
  unitsE8: -300_000_000,
  netProceedsCents: 4_500,
  ...patch,
});
const input = (events: readonly SecurityReplayEvent[]): SecurityReplayInput => ({
  securityId: 'security-1',
  currency: 'EUR',
  through: '2025-12-31',
  accounts: ['source', 'destination', 'third'].map((id) => ({ id, currency: 'EUR' })),
  events,
});
function success(result: SecurityReplayResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}
const lots = [
  acquisition(),
  acquisition({ id: 'lot-2', date: '2025-02-01', unitsE8: 600_000_000, basisCents: 7_200 }),
];
const figures = (result: ReturnType<typeof success>) =>
  result.holdings.map((h) => [h.accountId, h.unitsE8, h.basisCents, h.realizedGainCents]);

describe('Stage A known-basis security transfer replay (#520)', () => {
  it('carries FIFO acquisition dates and 5,200 cents, leaving 6,000 cents at source', () => {
    const result = success(replaySecurityTransfers(input([...lots, pair()]), 'fifo'));
    expect(figures(result)).toEqual([
      ['source', 500_000_000, 6_000, 0],
      ['destination', 500_000_000, 5_200, 0],
      ['third', 0, 0, 0],
    ]);
    expect(result.transfers[0]).toMatchObject({
      basisCents: 5_200,
      cashDeltaCents: 0,
      realizedGainDeltaCents: 0,
      fragments: [
        {
          acquisitionId: 'lot-1',
          acquiredOn: '2025-01-01',
          acquisitionOrder: 1,
          unitsE8: 400_000_000,
          basisCents: 4_000,
        },
        {
          acquisitionId: 'lot-2',
          acquiredOn: '2025-02-01',
          acquisitionOrder: 1,
          unitsE8: 100_000_000,
          basisCents: 1_200,
        },
      ],
    });
  });

  it('moves half of the 10,200-cent average pool and retains both acquisition dates', () => {
    const result = success(
      replaySecurityTransfers(
        input([
          lots[0]!,
          acquisition({ id: 'lot-2', date: '2025-02-01', unitsE8: 600_000_000, basisCents: 6_200 }),
          pair(),
        ]),
      ),
    );
    expect(figures(result)).toEqual([
      ['source', 500_000_000, 5_100, 0],
      ['destination', 500_000_000, 5_100, 0],
      ['third', 0, 0, 0],
    ]);
    expect(result.transfers[0]!.fragments).toEqual([
      {
        acquisitionId: 'lot-1',
        acquiredOn: '2025-01-01',
        acquisitionOrder: 1,
        unitsE8: 200_000_000,
        basisCents: null,
      },
      {
        acquisitionId: 'lot-2',
        acquiredOn: '2025-02-01',
        acquisitionOrder: 1,
        unitsE8: 300_000_000,
        basisCents: null,
      },
    ]);
  });

  it.each<CostMethod>(['fifo', 'average'])(
    'leaves the residual cent at source until its full transfer (%s)',
    (method) => {
      const events = [
        acquisition({ unitsE8: 200_000_000, basisCents: 1 }),
        pair('half', '2025-03-01', 100_000_000),
      ];
      expect(figures(success(replaySecurityTransfers(input(events), method)))).toEqual([
        ['source', 100_000_000, 1, 0],
        ['destination', 100_000_000, 0, 0],
        ['third', 0, 0, 0],
      ]);
      const result = success(
        replaySecurityTransfers(
          input([...events, pair('rest', '2025-03-02', 100_000_000)]),
          method,
        ),
      );
      expect(result.transfers.map((t) => t.basisCents)).toEqual([0, 1]);
      expect(figures(result)).toEqual([
        ['source', 0, 0, 0],
        ['destination', 200_000_000, 1, 0],
        ['third', 0, 0, 0],
      ]);
    },
  );

  it.each<CostMethod>(['fifo', 'average'])(
    'conserves fractional E8 units and repeated residual cents (%s)',
    (method) => {
      const result = success(
        replaySecurityTransfers(
          input([
            acquisition({ unitsE8: 3, basisCents: 100 }),
            pair('first', '2025-03-01', 1),
            pair('second', '2025-03-02', 1),
            pair('last', '2025-03-03', 1),
          ]),
          method,
        ),
      );
      expect(result.transfers.map((t) => t.basisCents)).toEqual([33, 33, 34]);
      expect(figures(result)).toEqual([
        ['source', 0, 0, 0],
        ['destination', 3, 100, 0],
        ['third', 0, 0, 0],
      ]);
    },
  );

  it.each([
    ['fifo', 6_000, 2_200, 1_500],
    ['average', 5_600, 2_240, 1_140],
  ] as const)(
    'replays later sales with %s basis and net proceeds',
    (method, sourceBasis, remaining, gain) => {
      const result = success(replaySecurityTransfers(input([...lots, pair(), sale()]), method));
      expect(figures(result)).toEqual([
        ['source', 500_000_000, sourceBasis, 0],
        ['destination', 200_000_000, remaining, gain],
        ['third', 0, 0, 0],
      ]);
    },
  );

  it.each<CostMethod>(['fifo', 'average'])(
    'keeps existing half-up sale rounding separate from transfer residuals (%s)',
    (method) => {
      const result = success(
        replaySecurityTransfers(
          input([
            acquisition({ unitsE8: 200_000_000, basisCents: 1 }),
            pair('all', '2025-03-01', 200_000_000),
            sale({ unitsE8: -100_000_000, netProceedsCents: 10 }),
          ]),
          method,
        ),
      );
      expect(figures(result)[1]).toEqual(['destination', 100_000_000, 0, 9]);
      // Literal expectations above; the existing shared functions are only a compatibility check.
      const canonical = method === 'fifo' ? fifoCost : averageCost;
      expect(
        canonical({ unitsE8: 200_000_000, costBasisCents: 1 }, [
          { kind: 'sell', unitsE8: -100_000_000, amountCents: 10, feeCents: 0 },
        ]),
      ).toEqual({ unitsE8: 100_000_000, costBasisCents: 0, realizedGainCents: 9 });
    },
  );

  it('orders transferred FIFO lots by original acquisition, ahead of later destination purchases', () => {
    const result = success(
      replaySecurityTransfers(
        input([
          ...lots,
          acquisition({
            id: 'destination-lot',
            accountId: 'destination',
            date: '2025-02-15',
            unitsE8: 200_000_000,
            basisCents: 4_000,
          }),
          pair(),
          sale(),
        ]),
        'fifo',
      ),
    );
    expect(figures(result)[1]).toEqual(['destination', 400_000_000, 6_200, 1_500]);
    expect(result.holdings[1]!.fragments.map((f) => f.acquisitionId)).toEqual([
      'lot-1',
      'lot-2',
      'destination-lot',
    ]);
  });

  it('combines transferred average basis with an existing destination pool before a later sale', () => {
    const result = success(
      replaySecurityTransfers(
        input([
          ...lots,
          acquisition({
            id: 'destination-lot',
            accountId: 'destination',
            date: '2025-02-15',
            unitsE8: 200_000_000,
            basisCents: 4_000,
          }),
          pair(),
          sale({ unitsE8: -350_000_000 }),
        ]),
        'average',
      ),
    );
    expect(figures(result)).toEqual([
      ['source', 500_000_000, 5_600, 0],
      ['destination', 350_000_000, 4_800, -300],
      ['third', 0, 0, 0],
    ]);
    expect(result.holdings[1]!.fragments.map((f) => [f.acquisitionId, f.unitsE8])).toEqual([
      ['lot-1', 100_000_000],
      ['lot-2', 150_000_000],
      ['destination-lot', 100_000_000],
    ]);
  });

  it.each([
    ['fifo', 3_600, 1_000],
    ['average', 3_360, 760],
  ] as const)('uses the source remainder after an earlier sale (%s)', (method, basis, gain) => {
    const result = success(
      replaySecurityTransfers(
        input([
          ...lots,
          sale({
            accountId: 'source',
            date: '2025-02-15',
            unitsE8: -200_000_000,
            netProceedsCents: 3_000,
          }),
          pair(),
        ]),
        method,
      ),
    );
    expect(figures(result)).toEqual([
      ['source', 300_000_000, basis, gain],
      ['destination', 500_000_000, 5_600, 0],
      ['third', 0, 0, 0],
    ]);
    expect(result.transfers[0]!.realizedGainDeltaCents).toBe(0);
  });

  it('reunites branched FIFO lots before rounding a later sale', () => {
    const result = success(
      replaySecurityTransfers(
        input([
          acquisition({ unitsE8: 4, basisCents: 2 }),
          pair('a', '2025-02-01', 2),
          pair('b', '2025-02-02', 2),
          sale({ unitsE8: -1, netProceedsCents: 10 }),
        ]),
        'fifo',
      ),
    );
    expect(figures(result)[1]).toEqual(['destination', 3, 1, 9]);
    expect(result.holdings[1]!.fragments).toHaveLength(1);
  });

  it.each<CostMethod>(['fifo', 'average'])(
    'uses explicit same-day order across a transfer chain (%s)',
    (method) => {
      const events = [
        acquisition({ date: '2025-03-01', unitsE8: 500_000_000 }),
        pair('a', '2025-03-01', 500_000_000, 'source', 'destination', 2),
        pair('b', '2025-03-01', 200_000_000, 'destination', 'third', 3),
      ];
      const result = success(replaySecurityTransfers(input(events.toReversed()), method));
      expect(figures(result)).toEqual([
        ['source', 0, 0, 0],
        ['destination', 300_000_000, 2_400, 0],
        ['third', 200_000_000, 1_600, 0],
      ]);
      expect(replaySecurityTransfers(input(events), method)).toEqual(result);
      expect(
        replaySecurityTransfers(
          input([events[0]!, { ...events[1]!, sequence: 4 }, events[2]!]),
          method,
        ),
      ).toEqual({ ok: false, reason: 'insufficient_units', eventId: 'b' });
    },
  );

  it.each<CostMethod>(['fifo', 'average'])(
    'fully replays backdated edits and pure remove/reapply (%s)',
    (method) => {
      const events = [...lots, pair(), sale()];
      const before = JSON.stringify(events);
      const original = replaySecurityTransfers(input(events), method);
      const changed = [acquisition({ basisCents: 8_000 }), ...events.slice(1)];
      const result = success(replaySecurityTransfers(input(changed), method));
      expect(result.transfers[0]!.basisCents).toBe(method === 'fifo' ? 9_200 : 7_600);
      expect(result.holdings[1]!.realizedGainCents).toBe(method === 'fifo' ? -1_500 : -60);
      expect(
        replaySecurityTransfers(
          input([acquisition({ unitsE8: 1 }), events[2]!, events[3]!]),
          method,
        ),
      ).toEqual({ ok: false, reason: 'insufficient_units', eventId: 'pair-1' });
      expect(figures(success(replaySecurityTransfers(input(lots), method)))).toEqual([
        ['source', 1_000_000_000, 11_200, 0],
        ['destination', 0, 0, 0],
        ['third', 0, 0, 0],
      ]);
      expect(replaySecurityTransfers(input(events), method)).toEqual(original);
      expect(JSON.stringify(events)).toBe(before);
    },
  );

  it('uses the dated boundary and excludes later facts', () => {
    const result = success(
      replaySecurityTransfers(
        { ...input([...lots, pair(), sale()]), through: '2025-02-28' },
        'fifo',
      ),
    );
    expect(result.transfers).toEqual([]);
    expect(figures(result)[0]).toEqual(['source', 1_000_000_000, 11_200, 0]);
  });

  it('uses exact integer products beyond floating-point multiplication precision', () => {
    const result = success(
      replaySecurityTransfers(
        input([
          acquisition({ unitsE8: 3, basisCents: 9_007_199_254_740_991 }),
          pair('large', '2025-03-01', 2),
        ]),
        'fifo',
      ),
    );
    expect(figures(result)).toEqual([
      ['source', 1, 3_002_399_751_580_331, 0],
      ['destination', 2, 6_004_799_503_160_660, 0],
      ['third', 0, 0, 0],
    ]);
  });

  it('rejects overflow while merging into the destination without returning partial results', () => {
    const events = [
      acquisition(),
      acquisition({
        id: 'large',
        accountId: 'destination',
        date: '2025-02-01',
        basisCents: Number.MAX_SAFE_INTEGER,
      }),
      pair('overflow', '2025-03-01', 100_000_000),
    ];
    const original = JSON.stringify(events);
    expect(replaySecurityTransfers(input(events), 'fifo')).toEqual({
      ok: false,
      reason: 'arithmetic_limit',
      eventId: 'overflow',
    });
    expect(JSON.stringify(events)).toBe(original);
  });
});

describe('manual-review boundaries', () => {
  it.each<CostMethod>(['fifo', 'average'])(
    'rejects unknown basis and funded same-day cycles (%s)',
    (method) => {
      expect(replaySecurityTransfers(input([acquisition({ basisCents: null })]), method)).toEqual({
        ok: false,
        reason: 'unknown_basis',
        eventId: 'lot-1',
      });
      expect(
        replaySecurityTransfers(
          input([
            acquisition(),
            pair('a', '2025-03-01', 100_000_000),
            pair('b', '2025-03-01', 100_000_000, 'destination', 'source', 2),
          ]),
          method,
        ),
      ).toEqual({ ok: false, reason: 'same_day_cycle', eventId: 'b' });
    },
  );

  it('rejects fractional average provenance instead of rounding E8 units', () => {
    const events = [
      acquisition({ unitsE8: 1, basisCents: 1 }),
      acquisition({ id: 'lot-2', date: '2025-02-01', unitsE8: 2, basisCents: 2 }),
      pair('fraction', '2025-03-01', 1),
    ];
    expect(replaySecurityTransfers(input(events), 'average')).toEqual({
      ok: false,
      reason: 'nonrepresentable_units',
      eventId: 'fraction',
    });
    expect(success(replaySecurityTransfers(input(events), 'fifo')).transfers[0]!.basisCents).toBe(
      1,
    );
  });

  it.each(['snapshot', 'delivery_in', 'delivery_out', 'split', 'merger', 'spinoff'] as const)(
    'does not infer lineage or convert unsupported %s events',
    (kind) => {
      expect(replaySecurityTransfers(input([{ ...acquisition(), kind }]))).toEqual({
        ok: false,
        reason: 'unsupported_event',
        eventId: 'lot-1',
      });
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid acquisition units %s',
    (unitsE8) => {
      expect(replaySecurityTransfers(input([acquisition({ unitsE8 })]))).toMatchObject({
        ok: false,
        reason: 'invalid_input',
      });
    },
  );

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid transfer units %s',
    (unitsE8) => {
      expect(
        replaySecurityTransfers(input([...lots, pair('invalid', '2025-03-01', unitsE8)])),
      ).toEqual({ ok: false, reason: 'invalid_pair', eventId: 'invalid' });
    },
  );

  it('rejects mismatched security, currency, dates, quantities, identities and order', () => {
    const transfer = pair();
    for (const patch of [
      { securityId: 'security-2' },
      { currency: 'USD' },
      { date: '2025-03-02' },
      { unitsE8: 1 },
      { accountId: 'source' },
    ]) {
      expect(
        replaySecurityTransfers(
          input([...lots, { ...transfer, incoming: { ...transfer.incoming, ...patch } }]),
        ),
      ).toEqual({ ok: false, reason: 'invalid_pair', eventId: 'pair-1' });
    }
    expect(
      replaySecurityTransfers(input([acquisition({ securityId: 'security-2' })])),
    ).toMatchObject({ ok: false, reason: 'security_mismatch' });
    expect(replaySecurityTransfers(input([acquisition({ currency: 'USD' })]))).toMatchObject({
      ok: false,
      reason: 'unsupported_currency',
    });
    expect(replaySecurityTransfers(input([acquisition({ date: '2025-02-30' })]))).toMatchObject({
      ok: false,
      reason: 'invalid_input',
    });
    expect(replaySecurityTransfers(input([acquisition(), acquisition()]))).toMatchObject({
      ok: false,
      reason: 'duplicate_identity',
    });
    expect(
      replaySecurityTransfers(input([acquisition(), acquisition({ id: 'duplicate-order' })])),
    ).toMatchObject({ ok: false, reason: 'ambiguous_order' });
    expect(
      replaySecurityTransfers(
        input([
          ...lots,
          { ...transfer, incoming: { ...transfer.incoming, id: transfer.outgoing.id } },
        ]),
      ),
    ).toMatchObject({ ok: false, reason: 'duplicate_identity' });
    expect(
      replaySecurityTransfers(
        input([
          ...lots,
          transfer,
          {
            ...pair('reuse', '2025-03-02', 1),
            incoming: { ...transfer.incoming, date: '2025-03-02', unitsE8: 1 },
          },
        ]),
      ),
    ).toMatchObject({ ok: false, reason: 'duplicate_identity' });
  });
});

describe('explicit paired scope', () => {
  it('is internal only with both accounts and values one-sided flows on the transfer date', () => {
    const transfer = success(replaySecurityTransfers(input([...lots, pair()]), 'fifo'))
      .transfers[0]!;
    expect(securityTransferScopeFlow(transfer, ['source', 'destination'], null)).toEqual({
      kind: 'internal',
      flowCents: 0,
    });
    expect(securityTransferScopeFlow(transfer, ['third'], null)).toEqual({
      kind: 'outside',
      flowCents: 0,
    });
    const valuation = { date: '2025-03-01', valueCents: 8_000 };
    expect(securityTransferScopeFlow(transfer, ['source'], valuation)).toEqual({
      kind: 'external',
      flowCents: -8_000,
    });
    expect(securityTransferScopeFlow(transfer, ['destination'], valuation)).toEqual({
      kind: 'external',
      flowCents: 8_000,
    });
    for (const value of [
      null,
      { ...valuation, date: '2025-02-28' },
      { ...valuation, valueCents: 0.5 },
      { ...valuation, valueCents: -1 },
    ]) {
      expect(securityTransferScopeFlow(transfer, ['source'], value)).toEqual({
        kind: 'unavailable',
      });
    }
  });
});
