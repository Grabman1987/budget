import { describe, expect, it } from 'vitest';
import { usEquityScheduledSessions, usEquitySessionCompletedAt } from './us-equity-calendar';

describe('US equity holiday table', () => {
  it('omits weekends and the published holidays, including observed ones', () => {
    const nov = usEquityScheduledSessions('2026-11')!;
    expect(nov).not.toContain('2026-11-26');
    expect(nov.slice(-2)).toEqual(['2026-11-27', '2026-11-30']);
    expect(usEquityScheduledSessions('2026-07')).not.toContain('2026-07-03');
    expect(usEquityScheduledSessions('2027-12')).not.toContain('2027-12-24');
    expect(usEquityScheduledSessions('2026-04')).not.toContain('2026-04-03');
    expect(
      usEquityScheduledSessions('2026-11')!.some((d) =>
        ['6', '0'].includes(String(new Date(`${d}T00:00:00Z`).getUTCDay())),
      ),
    ).toBe(false);
  });
  it('does not guess years outside the table', () => {
    expect(usEquityScheduledSessions('2024-05')).toBeNull();
    expect(usEquityScheduledSessions('2029-01')).toBeNull();
  });
  it('uses the 16:00 New York close in winter and summer time', () => {
    expect(usEquitySessionCompletedAt('2026-11-09')).toBe('2026-11-09T21:00:00.000Z');
    expect(usEquitySessionCompletedAt('2026-07-01')).toBe('2026-07-01T20:00:00.000Z');
    expect(usEquitySessionCompletedAt('2026-03-09')).toBe('2026-03-09T20:00:00.000Z');
  });
});
