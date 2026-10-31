import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

it.each([
  [undefined, false],
  ['', false],
  ['0', false],
  ['true', false],
  ['01', false],
  [' 1', false],
  ['1 ', false],
  ['1', true],
] as const)(
  'selects the redesigned presentation only for the exact build value %j',
  async (raw, enabled) => {
    vi.stubEnv('VITE_BUDGET_REDESIGN', raw);
    const { REDESIGN_ENABLED } = await import('./redesign-flag');
    expect(REDESIGN_ENABLED).toBe(enabled);
  },
);
