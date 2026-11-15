import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingInvariantError } from '@budget/db';
import { ApiError, errorAnswer, errorResponse } from './http';

afterEach(() => vi.restoreAllMocks());

describe('unhandled API diagnostics (#1144)', () => {
  it('correlates a 500 with a safe message, method, route pattern and source stack', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono().onError(errorResponse);
    app.patch('/bookings/:id', () => {
      throw new Error('Saved contact credit no longer matches its receipt');
    });
    const response = await app.request('/bookings/synthetic-id?memo=synthetic-secret', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo: 'synthetic-body-secret', amountCents: 123456789 }),
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string; errorId: string };
    expect(body).toEqual({
      error: 'server_error',
      message: 'Die Anfrage konnte nicht verarbeitet werden.',
      errorId: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
    expect(log).toHaveBeenCalledExactlyOnceWith('Unhandled API error', {
      errorId: body.errorId,
      method: 'PATCH',
      route: '/bookings/:id',
      name: 'Error',
      message: 'Saved contact credit no longer matches its receipt',
      stack: expect.arrayContaining([
        expect.stringMatching(/^apps\/server\/src\/api\/http-1144.test.ts:\d+:\d+$/),
      ]),
    });
    const logged = JSON.stringify(log.mock.calls);
    for (const secret of ['synthetic-id', 'synthetic-secret', 'synthetic-body-secret', '123456789'])
      expect(logged).not.toContain(secret);
  });

  it('redacts unknown messages, custom names, causes, absolute paths and stack headlines', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('synthetic name, amount 123456789, account and SQL parameters', {
      cause: { secret: 'synthetic-cause-secret' },
    });
    error.name = 'synthetic-sensitive-name';
    error.stack = [
      `${error.name}: ${error.message}`,
      '    at syntheticFunction (C:\\Users\\synthetic-user\\budget\\apps\\server\\src\\api\\bookings.ts:10:20)',
      '    at driver (/home/synthetic-user/node_modules/driver/index.js:30:40)',
      '    at /app/apps/server/dist/index.js:50:60',
    ].join('\n');
    const result = errorAnswer(error);
    expect(result.status).toBe(500);
    expect(log.mock.calls[0]).toEqual([
      'Unhandled API error',
      {
        errorId: result.body.errorId,
        method: null,
        route: null,
        name: 'Error',
        message: '[redacted unclassified message]',
        stack: ['apps/server/src/api/bookings.ts:10:20', 'apps/server/dist/index.js:50:60'],
      },
    ]);
    expect(JSON.stringify([result, log.mock.calls])).not.toContain('synthetic');
  });

  it('removes the entire multiline message before interpreting stack frames', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error(
      'synthetic-private-message\n    at /app/apps/server/src/synthetic-name-123.ts:1:2',
    );
    expect(error.stack).toContain('    at /app/apps/server/src/synthetic-name-123.ts:1:2');
    errorAnswer(error);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('synthetic-private-message');
    expect(logged).not.toContain('synthetic-name-123');
    expect(log.mock.calls[0]?.[1].stack).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^apps\/server\/src\/api\/http-1144.test.ts:\d+:\d+$/),
      ]),
    );
  });

  it('handles non-Error throws without logging their value and generates separate ids', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = errorAnswer({ secret: 'synthetic-secret' });
    const second = errorAnswer('synthetic-secret');
    expect(first.body.errorId).toMatch(/^[a-f0-9]{12}$/);
    expect(second.body.errorId).not.toBe(first.body.errorId);
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-secret');
    expect(log.mock.calls[0]?.[1]).toMatchObject({ name: 'Error', stack: [] });
  });

  it('preserves typed validation responses without logging or attaching an error id', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const error of [
      new BookingInvariantError('Die Aufteilung stimmt nicht mit dem Betrag überein.'),
      new ApiError(422, 'invalid', 'Bitte die Aufteilung prüfen.'),
    ]) {
      const result = errorAnswer(error);
      expect(result.status).toBe(422);
      expect(result.body.message).toBe(error.message);
      expect(result.body).not.toHaveProperty('errorId');
    }
    expect(log).not.toHaveBeenCalled();
  });
});
