import { expect, it } from 'vitest';
import * as heute from './index';
import { freeUntilPayday } from '../kpi/free-until-payday';
import { addDays } from '../date';

it.each([
  ['2026-10-05', 38_000, 10, 3_800],
  ['2026-10-14', 3_801, 1, 3_801],
  ['2026-10-15', 3_801, 1, 3_801],
  ['2026-10-16', 3_801, 28, 136],
  ['2026-12-16', 3_801, 30, 127],
  ['2026-10-05', 0, 10, null],
  ['2026-10-05', -1, 10, null],
] as const)(
  'derives the daily budget on %s from the exact lead %i',
  (today, freeCents, remainingDays, perDayCents) => {
    const lead = freeUntilPayday({
      today,
      payday: heute.nextPayday(today).day,
      envelopes: [
        {
          id: 'synthetic',
          name: 'Synthetic envelope',
          class: 'need',
          availableCents: freeCents + 101,
        },
      ],
      openOutflows: [{ id: 'bill', label: 'Synthetic bill', day: addDays(today, -1), cents: 101 }],
    });
    expect(lead.freeCents).toBe(freeCents);
    expect(heute.dailyBudget(lead)).toEqual({ remainingDays, perDayCents });
  },
);
