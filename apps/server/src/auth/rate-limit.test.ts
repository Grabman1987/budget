import { describe, expect, it } from 'vitest';
import { clientKey, RateLimiter } from './rate-limit';

const MINUTE = 60_000;

describe('clientKey', () => {
  it('keys IPv6 by its /64 prefix, whatever the notation', () => {
    const key = clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(key).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:0db8:0001:0002::1')).toBe(key);
    expect(clientKey('2001:DB8:1:2:ffff::')).toBe(key);
    expect(clientKey('2001:db8:1:2::1%eth0')).toBe(key);
    expect(clientKey('2001:db8:1:3::1')).not.toBe(key);
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
    expect(clientKey('64:ff9b::192.0.2.1')).toBe('64:ff9b:0:0::/64');
  });

  it('keeps IPv4 (also IPv4-mapped IPv6) as the full address', () => {
    expect(clientKey('192.0.2.7')).toBe('192.0.2.7');
    expect(clientKey('::ffff:192.0.2.7')).toBe('192.0.2.7');
    expect(clientKey('unknown')).toBe('unknown');
  });
});

describe('RateLimiter', () => {
  it('allows `limit` attempts per sliding window and reports the first breach once', () => {
    const limiter = new RateLimiter(3, 15 * MINUTE);
    const results = Array.from({ length: 6 }, (_, i) => limiter.check('a', i));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false, false]);
    expect(results.map((r) => r.firstBreach)).toEqual([false, false, false, true, false, false]);
    expect(limiter.allow('b', 10)).toBe(true);
    expect(limiter.allow('a', 15 * MINUTE + 10)).toBe(true);
  });

  it('keeps a hammering key blocked and stores at most limit + 1 hits for it', () => {
    const limiter = new RateLimiter(2, MINUTE);
    for (let i = 0; i < 10_000; i++) limiter.allow('flood', i);
    expect(limiter.count('flood', 10_000)).toBe(3);
    // The flood itself keeps the window full: still blocked shortly after, free a window later.
    expect(limiter.allow('flood', 10_001)).toBe(false);
    expect(limiter.allow('flood', 10_001 + MINUTE)).toBe(true);
  });

  it('caps the number of keys and evicts the least recently seen one', () => {
    const limiter = new RateLimiter(1, MINUTE, { maxKeys: 100 });
    limiter.allow('keep', 0);
    limiter.allow('keep', 1); // blocked, and now the most recent key
    for (let i = 0; i < 20_000; i++) {
      limiter.allow(`k${i}`, 2);
      if (i % 50 === 0) limiter.allow('keep', 2);
    }
    expect(limiter.size).toBeLessThanOrEqual(100);
    expect(limiter.allow('keep', 3)).toBe(false);
    expect(limiter.count('k0', 3)).toBe(0);
  });

  it('forgets keys whose window has passed', () => {
    const limiter = new RateLimiter(5, MINUTE);
    for (let i = 0; i < 500; i++) limiter.allow(`k${i}`, 0);
    limiter.allow('late', 2 * MINUTE);
    expect(limiter.size).toBe(1);
  });

  it('has a global ceiling per window across all keys; blocked keys do not use it up', () => {
    const limiter = new RateLimiter(2, MINUTE, { globalLimit: 5 });
    for (let i = 0; i < 10; i++) limiter.allow('noisy', i);
    const spread = Array.from({ length: 8 }, (_, i) => limiter.check(`ip${i}`, 20));
    // noisy used 2 of the 5; three more distinct clients get in, then everyone waits.
    expect(spread.map((r) => r.allowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(spread.filter((r) => r.firstBreach)).toHaveLength(1);
    expect(limiter.allow('ip9', MINUTE + 20)).toBe(true);
  });
});
