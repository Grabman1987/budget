import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repoRoot } from '../.claude/hooks/input.mjs';
import { shouldFormat } from '../.claude/hooks/format-file.mjs';
import { blockReason } from '../.claude/hooks/protect-files.mjs';

let fixture;
const sql = 'packages/db/drizzle/0000_synthetic.sql';
const snapshot = 'packages/db/drizzle/meta/0000_snapshot.json';

function write(path, content) {
  const file = join(fixture, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
    // Synthetic identity only, never the developer's configured identity.
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Synthetic Automation',
      GIT_COMMITTER_NAME: 'Synthetic Automation',
      GIT_AUTHOR_EMAIL: 'automation@example.invalid',
      GIT_COMMITTER_EMAIL: 'automation@example.invalid',
    },
  }).trim();
}

function hook(script, path, tool = 'Edit', overrides = {}) {
  const input = { cwd: fixture, tool_name: tool, tool_input: { file_path: path }, ...overrides };
  return spawnSync(process.execPath, [join(fixture, '.claude/hooks', script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
}

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'budget-claude-hooks-'));
  cpSync(join(repoRoot, '.claude/hooks'), join(fixture, '.claude/hooks'), { recursive: true });
  write('.prettierignore', '*.md\nignored/\n.claude/\npackage-lock.json\n');
  write(sql, '-- synthetic predecessor\n');
  write(snapshot, '{}\n');
  write('packages/db/drizzle/meta/_journal.json', '{}\n');
  git('init', '--quiet');
  git('add', 'packages');
  git(
    '-c',
    'commit.gpgSign=false',
    '-c',
    'core.hooksPath=',
    'commit',
    '--quiet',
    '-m',
    'test: synthetic predecessor',
  );
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  // A directory junction on Windows needs no symlink privilege.
  symlinkSync(join(repoRoot, 'node_modules'), join(fixture, 'node_modules'), 'junction');
});

afterAll(() => {
  if (!fixture) return;
  if (existsSync(join(fixture, 'node_modules'))) unlinkSync(join(fixture, 'node_modules'));
  rmSync(fixture, { recursive: true, force: true });
});

describe('format hook', () => {
  it.each(['ts', 'tsx', 'js', 'mjs', 'json', 'css', 'md', 'yml', 'yaml'])(
    'recognizes .%s only with a parser and no ignore match',
    (ext) => {
      expect(shouldFormat(`synthetic.${ext}`, { ignored: false, inferredParser: 'parser' })).toBe(
        true,
      );
      expect(shouldFormat(`synthetic.${ext}`, { ignored: true, inferredParser: 'parser' })).toBe(
        false,
      );
      expect(shouldFormat(`synthetic.${ext}`, { ignored: false, inferredParser: null })).toBe(
        false,
      );
    },
  );

  it('formats a space-containing path via synthetic Write stdin from another cwd', () => {
    const file = write('src/format me.ts', 'const synthetic={count:1};');
    const result = hook('format-file.mjs', file, 'Write');
    expect(result.status, result.stderr).toBe(0);
    expect(
      result.stderr === '' || result.stderr.includes('formatted with the installed local CLI'),
    ).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('const synthetic = { count: 1 };\n');
  });

  it.each(['ignored/skip.ts', 'notes.md', 'data/skip.csv', '.claude/skip.js'])(
    'leaves %s unchanged',
    (path) => {
      const file = write(path, 'synthetic  unformatted');
      const result = hook('format-file.mjs', file);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(readFileSync(file, 'utf8')).toBe('synthetic  unformatted');
    },
  );

  it('skips outside paths and symlink targets outside the repository', () => {
    const outside = join(tmpdir(), `outside-${fixture.split(/[\\/]/).at(-1)}.ts`);
    writeFileSync(outside, 'synthetic  unformatted');
    try {
      expect(hook('format-file.mjs', outside).status).toBe(0);
      const alias = join(fixture, 'external');
      symlinkSync(tmpdir(), alias, 'junction');
      try {
        expect(hook('format-file.mjs', join(alias, outside.split(/[\\/]/).at(-1))).status).toBe(0);
      } finally {
        unlinkSync(alias);
      }
      expect(readFileSync(outside, 'utf8')).toBe('synthetic  unformatted');
    } finally {
      unlinkSync(outside);
    }
  });

  it('keeps a syntactically invalid edit and logs a short note', () => {
    const file = write('src/broken.ts', 'const = ;');
    const result = hook('format-file.mjs', file);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('edit kept');
    expect(result.stderr).not.toContain('const =');
    expect(readFileSync(file, 'utf8')).toBe('const = ;');
  });
});

describe('protection hook', () => {
  it.each([
    'package-lock.json',
    '.env',
    '.env.local',
    'apps/server/.env.production',
    sql,
    snapshot,
    'packages/db/drizzle/meta/_journal.json',
  ])('blocks %s with bilingual stderr and exit 2', (path) => {
    const result = hook('protect-files.mjs', path);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Geschützte Datei / Protected file');
    expect(result.stderr).toContain('npm run db:generate');
    expect(result.stderr).toContain('npm install');
    expect(result.stdout).toBe('');
  });

  it.each([
    '.env.example',
    'apps/server/.env.example',
    'src/new.ts',
    'packages/db/drizzle/0001_new.sql',
    'packages/db/drizzle/meta/0001_snapshot.json',
  ])('allows %s including new migration files', (path) => {
    expect(hook('protect-files.mjs', path, 'Write').status).toBe(0);
  });

  it('handles MultiEdit, nested cwd, separators and normalized traversal', () => {
    expect(
      hook('protect-files.mjs', '../../package-lock.json', 'MultiEdit', {
        cwd: join(fixture, 'packages/db'),
      }).status,
    ).toBe(2);
    expect(
      hook('protect-files.mjs', 'packages\\db\\drizzle\\0000_synthetic.sql', 'MultiEdit').status,
    ).toBe(2);
    expect(
      hook('protect-files.mjs', 'src/safe.ts', 'MultiEdit', {
        tool_input: { file_path: 'src/safe.ts', edits: [{ file_path: sql }] },
      }).status,
    ).toBe(2);
  });

  it('blocks symlink aliases of protected migrations', () => {
    const alias = join(fixture, 'alias');
    symlinkSync(join(fixture, 'packages/db/drizzle'), alias, 'junction');
    try {
      expect(hook('protect-files.mjs', 'alias/0000_synthetic.sql').status).toBe(2);
    } finally {
      unlinkSync(alias);
    }
  });

  it('leaves Bash generation and files outside this repo alone', () => {
    expect(hook('protect-files.mjs', sql, 'Bash').status).toBe(0);
    expect(hook('protect-files.mjs', join(tmpdir(), 'package-lock.json')).status).toBe(0);
  });

  it('has exact decision boundaries independent of the current main tree', () => {
    expect(blockReason('packages/db/drizzle/new.sql', new Set())).toBe(null);
    expect(blockReason(sql, new Set([sql]))).toBe('migration');
    expect(blockReason('.env.example', new Set())).toBe(null);
    expect(blockReason('.env.example.local', new Set())).toBe('environment');
  });

  it('blocks unknown ancestry instead of treating an existing migration as new', () => {
    git('update-ref', '-d', 'refs/remotes/origin/main');
    try {
      const result = hook('protect-files.mjs', sql);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('File protection could not be verified');
      expect(hook('protect-files.mjs', 'src/safe.ts').status).toBe(0);
    } finally {
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    }
  });
});

it('fails open only for formatter errors when stdin is malformed', () => {
  for (const [script, status] of [
    ['format-file.mjs', 0],
    ['protect-files.mjs', 2],
  ]) {
    const result = spawnSync(process.execPath, [join(fixture, '.claude/hooks', script)], {
      input: '{',
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    expect(result.status).toBe(status);
    expect(result.stderr).not.toBe('');
  }
});
