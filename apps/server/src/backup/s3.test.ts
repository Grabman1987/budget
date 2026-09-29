import { describe, expect, it } from 'vitest';
import { backupsToDelete } from './retention';
import { amzDate, signV4 } from './s3';

describe('signV4', () => {
  it('matches the AWS SigV4 test suite vector "get-vanilla"', () => {
    const date = new Date('2015-08-30T12:36:00Z');
    expect(amzDate(date)).toBe('20150830T123600Z');
    const authorization = signV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      headers: { 'x-amz-date': amzDate(date) },
      // SHA-256 of the empty body
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      date,
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
    });
    expect(authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('matches the vector "get-vanilla-query-order-key-case" (sorted query)', () => {
    const date = new Date('2015-08-30T12:36:00Z');
    const authorization = signV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/?Param2=value2&Param1=value1'),
      headers: { 'x-amz-date': amzDate(date) },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      date,
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
    });
    expect(authorization).toMatch(
      /Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500$/,
    );
  });
});

describe('backupsToDelete', () => {
  const key = (day: string) => `encrypted/budget-${day}.sqlite.age`;

  it('keeps everything while there are few copies', () => {
    expect(backupsToDelete([key('2026-10-01'), key('2026-10-02')])).toEqual([]);
  });

  it('keeps the newest 30 days and the first copy of the newest 12 months', () => {
    const days: string[] = [];
    for (let t = Date.parse('2025-01-01'); t <= Date.parse('2026-10-31'); t += 86_400_000)
      days.push(new Date(t).toISOString().slice(0, 10));
    const deleted = new Set(backupsToDelete([...days.map(key), 'encrypted/notes.txt']));
    const kept = days.filter((d) => !deleted.has(key(d)));
    expect(kept.filter((d) => d >= '2026-10-02')).toHaveLength(30);
    // 12 months: November 2025 to October 2026; the first of October is older than the 30 days.
    expect(kept.filter((d) => d < '2026-10-02')).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(deleted.has('encrypted/notes.txt')).toBe(false);
  });
});
