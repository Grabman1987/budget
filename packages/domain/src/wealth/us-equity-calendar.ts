/**
 * Published US equity-market holiday table (NYSE/Nasdaq close together). It is used for exactly two
 * things: (1) to VETO evidence: a stored session list that omits a scheduled session or contains an
 * unscheduled one is rejected, and (2) to name the not yet observed sessions of the running month,
 * which the monthly decision needs (penultimate and last session) before they have happened.
 * Session dates of the signal series themselves always come from stored evidence, never from here.
 *
 * 2026-2028: official NYSE "Holidays & Trading Hours" page (checked 10.11.2026). 2025: the same
 * rules plus the one-off closing of 09.01.2025 (day of mourning); not on that page. Years outside
 * the table are unknown on purpose: callers get `null` and must report "unavailable".
 */
export const US_EQUITY_CALENDAR_ID = 'us-equity-holiday-table-2025-2028';
export const US_EQUITY_CALENDAR_SOURCE_ID = 'nyse-published-holiday-table';

export const US_EQUITY_HOLIDAYS: Readonly<Record<number, readonly string[]>> = {
  2025: [
    '2025-01-01',
    '2025-01-09',
    '2025-01-20',
    '2025-02-17',
    '2025-04-18',
    '2025-05-26',
    '2025-06-19',
    '2025-07-04',
    '2025-09-01',
    '2025-11-27',
    '2025-12-25',
  ],
  2026: [
    '2026-01-01',
    '2026-01-19',
    '2026-02-16',
    '2026-04-03',
    '2026-05-25',
    '2026-06-19',
    '2026-07-03',
    '2026-09-07',
    '2026-11-26',
    '2026-12-25',
  ],
  2027: [
    '2027-01-01',
    '2027-01-18',
    '2027-02-15',
    '2027-03-26',
    '2027-05-31',
    '2027-06-18',
    '2027-07-05',
    '2027-09-06',
    '2027-11-25',
    '2027-12-24',
  ],
  2028: [
    '2028-01-17',
    '2028-02-21',
    '2028-04-14',
    '2028-05-29',
    '2028-06-19',
    '2028-07-04',
    '2028-09-04',
    '2028-11-23',
    '2028-12-25',
  ],
};

/** Scheduled sessions of a `YYYY-MM` month, or null when the table does not cover its year. */
export function usEquityScheduledSessions(month: string): string[] | null {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const holidays = US_EQUITY_HOLIDAYS[year];
  if (!holidays || !(mon >= 1 && mon <= 12)) return null;
  const days: string[] = [];
  for (let d = Date.UTC(year, mon - 1, 1); new Date(d).getUTCMonth() === mon - 1; d += 86_400_000) {
    const date = new Date(d);
    const iso = date.toISOString().slice(0, 10);
    if (date.getUTCDay() % 6 !== 0 && !holidays.includes(iso)) days.push(iso);
  }
  return days;
}

/**
 * UTC time of the regular 16:00 America/New_York close of a session day. Early closes (13:00) are
 * deliberately not modelled: the later time is the conservative bound for "completed".
 */
export function usEquitySessionCompletedAt(date: string): string {
  const at20 = Date.parse(`${date}T20:00:00.000Z`);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at20),
  );
  return new Date(hour === 16 ? at20 : at20 + 3_600_000).toISOString();
}
