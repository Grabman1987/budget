import { fileURLToPath } from 'node:url';

/**
 * Resolve `relative` against the location of a module (`import.meta.url`) and return a file system
 * path. `new URL(...).pathname` is wrong for this: it keeps percent-escapes (`Max%20Muster`) and a
 * leading slash before the drive letter on Windows (`/C:/...`). `windows` forces the Windows
 * flavour so the behaviour can be tested on any platform.
 */
export function moduleRelativePath(
  moduleUrl: string,
  relative: string,
  options: { windows?: boolean } = {},
): string {
  return fileURLToPath(new URL(relative, moduleUrl), options);
}

/** `data/dev.sqlite` in the repository root: shared by `npm run db:seed` and `npm run dev`. */
export const devDatabasePath = (): string =>
  moduleRelativePath(import.meta.url, '../../../data/dev.sqlite');
