import { randomBytes } from 'node:crypto';

// Only literal, data-free diagnostics may leave the process. Unknown messages (including
// database/driver errors) can contain financial input, so regex redaction is not sufficient.
const SAFE_MESSAGES = new Set([
  'Invalid contact amount',
  'Allocation exceeds an open outlay or repeats its target',
  'Allocate the receipt up to the open balance; retain only the excess as credit',
  'Invalid contact movement',
  'Contact balance exceeds integer range',
  'Allocation exceeds an open outlay',
  'Repeated contact credit source',
  'Selected contact credit is no longer available',
  'Saved contact credit no longer matches its receipt',
  'Contact settlement is missing its actual receipt',
  'Invalid contact balance',
  'Contact totals exceed integer range',
]);
const SAFE_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'ContactInvariantError',
]);

/** Correlate a generic 500 with a bounded diagnostic, never the error object or request data. */
export function logUnhandledError(
  error: unknown,
  request?: { method: string; route: string },
): string {
  const errorId = randomBytes(6).toString('hex');
  const message =
    error instanceof Error && SAFE_MESSAGES.has(error.message)
      ? error.message
      : '[redacted unclassified message]';
  const headline = error instanceof Error ? `${error.name}: ${error.message}\n` : '';
  const frames =
    error instanceof Error && error.stack?.startsWith(headline)
      ? error.stack.slice(headline.length)
      : '';
  // Keep application source locations, not the stack headline, function arguments, absolute
  // machine paths, or driver frames. This works for source tests and the deployed JS bundle.
  const stack = frames
    ? frames
        .split('\n')
        .slice(0, 100)
        .filter((line) => /^\s+at /.test(line))
        .flatMap((line) => {
          const location = line.match(
            /(?:\/|\\)((?:apps[\\/]server|packages[\\/](?:db|domain))[\\/](?:src|dist)[\\/][\w./\\-]+\.[cm]?[jt]s:\d+:\d+)\)?$/,
          );
          return location ? [location[1]!.replaceAll('\\', '/')] : [];
        })
        .slice(0, 20)
    : [];
  console.error('Unhandled API error', {
    errorId,
    method: request?.method ?? null,
    route: request?.route ?? null,
    name: error instanceof Error && SAFE_NAMES.has(error.name) ? error.name : 'Error',
    message,
    stack,
  });
  return errorId;
}
