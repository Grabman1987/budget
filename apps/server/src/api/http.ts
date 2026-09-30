import {
  AuditError,
  BookingInvariantError,
  ConflictError,
  EntityNotFoundError,
  ReconciledLockedError,
} from '@budget/db';
import type { Context } from 'hono';
import { ZodError, type ZodType } from 'zod';

/** Who acts in the audit log: there is exactly one user. */
export const ACTOR = 'owner';

/** A request the server refuses with a JSON error `{ error, message }`. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Parse a JSON body with `schema`; an empty or broken body is a 400. */
export async function readBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid', 'The request body is not valid JSON');
  }
  return schema.parse(raw);
}

/** Parse query parameters (strings) with `schema`. */
export function readQuery<T>(c: Context, schema: ZodType<T>): T {
  return schema.parse(c.req.query());
}

/**
 * Drop `undefined` values: the repositories take absent keys, never `undefined` (strict optional
 * types). The target type comes from the context (the parameter it is passed to); zod has
 * already checked the values.
 */
export function defined<R>(value: object): R {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as R;
}

interface SqliteError {
  code?: string;
  message: string;
}
const isSqliteConstraint = (e: unknown): e is SqliteError =>
  typeof e === 'object' &&
  e !== null &&
  String((e as SqliteError).code ?? '').startsWith('SQLITE_CONSTRAINT');

/** One place that turns errors of the ledger API into HTTP answers. */
export function errorResponse(error: unknown, c: Context) {
  if (error instanceof ApiError) {
    return c.json({ error: error.code, message: error.message, ...error.extra }, error.status);
  }
  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'invalid',
        message: 'The request is not valid',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400,
    );
  }
  if (error instanceof EntityNotFoundError) {
    return c.json({ error: 'not_found', message: error.message }, 404);
  }
  if (error instanceof ReconciledLockedError) {
    return c.json(
      { error: 'reconciled_locked', message: error.message, bookingIds: error.bookingIds },
      409,
    );
  }
  if (error instanceof ConflictError)
    return c.json({ error: 'conflict', message: error.message }, 409);
  if (error instanceof AuditError)
    return c.json({ error: 'undo_refused', message: error.message }, 409);
  if (error instanceof BookingInvariantError) {
    return c.json({ error: 'invariant', message: error.message }, 422);
  }
  if (error instanceof RangeError) return c.json({ error: 'invalid', message: error.message }, 400);
  if (isSqliteConstraint(error)) {
    return c.json({ error: 'constraint', message: 'The data violates a rule of the ledger' }, 422);
  }
  console.error('Unhandled API error', error instanceof Error ? error.name : typeof error);
  return c.json({ error: 'server_error', message: 'Something went wrong' }, 500);
}
