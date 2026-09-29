import { describe, expect, it } from 'vitest';
import { devDatabasePath, moduleRelativePath } from './paths';

describe('moduleRelativePath', () => {
  it('decodes spaces and other percent-escapes in a POSIX path', () => {
    const url = 'file:///home/max%20muster/my%20budget/packages/db/src/client.ts';
    expect(moduleRelativePath(url, '../drizzle', { windows: false })).toBe(
      '/home/max muster/my budget/packages/db/drizzle',
    );
  });

  it('yields a valid Windows path with drive letter, no leading slash, no escapes', () => {
    const url = 'file:///C:/Users/Max%20Muster/budget/packages/db/src/client.ts';
    expect(moduleRelativePath(url, '../drizzle', { windows: true })).toBe(
      'C:\\Users\\Max Muster\\budget\\packages\\db\\drizzle',
    );
    // What `new URL(...).pathname` would have produced: unusable on Windows.
    expect(new URL('../drizzle', url).pathname).toBe(
      '/C:/Users/Max%20Muster/budget/packages/db/drizzle',
    );
  });

  it('points the dev database into the repository data folder', () => {
    expect(devDatabasePath().replaceAll('\\', '/')).toMatch(/\/data\/dev\.sqlite$/);
  });
});
