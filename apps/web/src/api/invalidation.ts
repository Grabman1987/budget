/**
 * Which cached query families a successful write makes stale. The first element of a query key is
 * its family root (`ledger`, `budget`, `goals`, `auth`, ...). Anything that may change money or the
 * session invalidates every family; only writes with a provably small reach are narrowed, and
 * ledger writes spare the settings-like families they cannot change. When unsure keep it broad:
 * a stale figure is worse than one more read.
 */
const SETTINGS_ROOTS = new Set(['auth', 'display-settings', 'profile']);

const SESSION_PATHS = new Set([
  '/api/auth/register/verify',
  '/api/auth/login/verify',
  '/api/auth/recovery/login',
  '/api/auth/logout',
]);

type KeyHolder = { queryKey: readonly unknown[] };

/** Predicate for `invalidateQueries` after a write to `path`; `undefined` means every family. */
export function invalidationPredicate(path?: string): ((query: KeyHolder) => boolean) | undefined {
  if (!path) return undefined;
  const pathname = path.split('?')[0] ?? path;
  // Session changes may swap the whole data set.
  if (SESSION_PATHS.has(pathname)) return undefined;
  const root = (query: KeyHolder) => String(query.queryKey[0]);
  // Step-up proofs and passkey management only touch the auth families.
  if (pathname.startsWith('/api/auth/')) return (query) => root(query) === 'auth';
  if (pathname.startsWith('/api/display-settings'))
    return (query) => root(query) === 'display-settings';
  // Every other write can move balances, plans or checks, but never sessions or display settings.
  return (query) =>
    !SETTINGS_ROOTS.has(root(query)) ||
    (root(query) === 'profile' && pathname.startsWith('/api/profile'));
}
