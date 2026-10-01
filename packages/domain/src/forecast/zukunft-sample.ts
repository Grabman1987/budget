/**
 * Synthetic fixture for the liquidity forecast tests: the dated items and the variable plan per day that
 * `forecast()` in design/prototype/reports-zukunft.js produces for its own sample ledger, starting on
 * 17.09.2026 (day 0), rounded to whole cents. Dumped once from the prototype; the prototype's own
 * 90-day low point (floats) is kept next to it as the expected value.
 */

export const PROTO_START_DAY = '2026-09-17';
export const PROTO_START_CENTS = 116700;
export const PROTO_SWEEP_BUFFER_CENTS = 560000;
export const PROTO_LOW = { day: 73, cents: 14484 } as const;

/** Planned events of the prototype (key = month, day of month). */
export const PROTO_EVENTS = [
  { key: '2026-12', day: 5, cents: -250000 },
  { key: '2027-01', day: 10, cents: -90000 },
  { key: '2027-02', day: 28, cents: -381200 },
  { key: '2027-03', day: 10, cents: 160000 },
] as const;

/** [days after the start, kind, cents] for days 1..90. */
export const PROTO_ITEMS: ReadonlyArray<readonly [number, 'income' | 'fixed', number]> = [
  [3, 'fixed', -1799],
  [3, 'income', 18968],
  [5, 'fixed', -2500],
  [8, 'fixed', -10500],
  [13, 'fixed', -690],
  [13, 'income', 381200],
  [13, 'income', 80000],
  [14, 'fixed', -89000],
  [14, 'fixed', -4200],
  [16, 'fixed', -41200],
  [18, 'fixed', -1290],
  [18, 'fixed', -40000],
  [21, 'fixed', -1695],
  [23, 'fixed', -4800],
  [23, 'fixed', -2800],
  [25, 'fixed', -299],
  [27, 'fixed', -848],
  [28, 'fixed', -6000],
  [29, 'fixed', -30000],
  [33, 'fixed', -1799],
  [33, 'income', 18968],
  [35, 'fixed', -2500],
  [38, 'fixed', -10500],
  [43, 'fixed', -690],
  [44, 'income', 381200],
  [44, 'income', 80000],
  [45, 'fixed', -89000],
  [45, 'fixed', -4200],
  [47, 'fixed', -41200],
  [49, 'fixed', -1290],
  [49, 'fixed', -40000],
  [52, 'fixed', -1695],
  [54, 'fixed', -4800],
  [54, 'fixed', -2800],
  [56, 'fixed', -299],
  [58, 'fixed', -848],
  [59, 'fixed', -6000],
  [60, 'fixed', -30000],
  [64, 'fixed', -1799],
  [64, 'income', 18968],
  [66, 'fixed', -2500],
  [69, 'fixed', -10500],
  [74, 'fixed', -690],
  [74, 'income', 381200],
  [74, 'income', 80000],
  [74, 'income', 130854],
  [75, 'fixed', -89000],
  [75, 'fixed', -4200],
  [77, 'fixed', -41200],
  [79, 'fixed', -1290],
  [79, 'fixed', -40000],
  [82, 'fixed', -1695],
  [84, 'fixed', -4800],
  [84, 'fixed', -2800],
  [86, 'fixed', -299],
  [88, 'fixed', -848],
  [89, 'fixed', -6000],
  [89, 'income', 34000],
  [90, 'fixed', -30000],
];

/** Variable plan per day in cents for days 1..90 (index 0 = day 1). */
export const PROTO_VARIABLE_CENTS: readonly number[] = [
  7874, 7875, 7876, 7877, 7878, 7879, 7880, 7881, 7882, 7883, 7884, 7885, 7886, 7772, 7773, 7774,
  7775, 7776, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789, 7790,
  7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7802, 8524, 8525, 8526, 8528,
  8529, 8530, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8539, 8540, 8541, 8542, 8543, 8544, 8545,
  8546, 8547, 8549, 8550, 8551, 8552, 8553, 8554, 8555, 8556, 8536, 8537, 8538, 8539, 8540, 8541,
  8542, 8543, 8545, 8546, 8547, 8548, 8549, 8550, 8551, 8552,
];
