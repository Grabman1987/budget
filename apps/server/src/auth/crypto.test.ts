import { describe, expect, it } from 'vitest';
import { authConfigFromEnv } from './config';
import { generateRecoveryCodes, hashRecoveryCode } from './crypto';

const PEPPER = Buffer.from('pepper-for-tests-only-0123456789abcdef');

describe('recovery codes', () => {
  it('are 16 Crockford characters (80 bits) in four readable groups', () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes)
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it('are stored as an HMAC with the pepper: normalised input, different pepper, different hash', () => {
    const code = 'ABCD-EFGH-JKMN-PQRS';
    const hash = hashRecoveryCode(PEPPER, code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(PEPPER, 'abcd efgh jkmn pqrs')).toBe(hash);
    expect(hashRecoveryCode(Buffer.from('another-pepper-0123456789abcdefghij'), code)).not.toBe(
      hash,
    );
  });
});

describe('BUDGET_PEPPER', () => {
  const production = { NODE_ENV: 'production', BUDGET_ORIGIN: 'https://budget.example' };

  it('is required in production and must be long enough', () => {
    expect(() => authConfigFromEnv(production)).toThrow(/BUDGET_PEPPER is required/);
    expect(() => authConfigFromEnv({ ...production, BUDGET_PEPPER: 'short' })).toThrow(/at least/);
    const value = 'x'.repeat(44);
    expect(authConfigFromEnv({ ...production, BUDGET_PEPPER: value }).pepper.toString()).toBe(
      value,
    );
  });

  it('is generated per run in development and tests', () => {
    const a = authConfigFromEnv({}).pepper;
    const b = authConfigFromEnv({}).pepper;
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe('authentication origin configuration', () => {
  const production = {
    NODE_ENV: 'production',
    BUDGET_PEPPER: 'synthetic-pepper-0123456789abcdef012345',
  };

  it('requires HTTPS in production while retaining local HTTP development', () => {
    expect(() =>
      authConfigFromEnv({ ...production, BUDGET_ORIGIN: 'http://budget.example' }),
    ).toThrow('BUDGET_ORIGIN must use HTTPS in production');
    // The container smoke test runs in production mode against loopback over plain HTTP.
    expect(
      authConfigFromEnv({ ...production, BUDGET_ORIGIN: 'http://localhost:3000' }),
    ).toMatchObject({ origin: 'http://localhost:3000', cookieSecure: false });
    expect(
      authConfigFromEnv({ ...production, BUDGET_ORIGIN: 'https://budget.example' }),
    ).toMatchObject({
      origin: 'https://budget.example',
      rpID: 'budget.example',
      cookieSecure: true,
    });
    expect(authConfigFromEnv({ BUDGET_ORIGIN: 'http://localhost:3000' })).toMatchObject({
      origin: 'http://localhost:3000',
      cookieSecure: false,
    });
  });

  it.each([
    'not an origin',
    'ftp://budget.example',
    'https://synthetic-user:synthetic-password@budget.example',
    'https://budget.example/login',
    'https://budget.example?secret=synthetic-value',
    'https://budget.example#fragment',
  ])('rejects a non-origin configuration without echoing its value: %s', (origin) => {
    try {
      authConfigFromEnv({ ...production, BUDGET_ORIGIN: origin });
      expect.fail('Invalid origin accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/^BUDGET_ORIGIN must be/);
      expect((error as Error).message).not.toContain(origin);
    }
  });
});
