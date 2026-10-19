import { spawnSync } from 'node:child_process';
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
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repoRoot } from '../../.claude/hooks/input.mjs';

let fixture;

function write(path, content) {
  const file = join(fixture, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function hook(file, tool = 'Write', extraPaths = []) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(join(fixture, 'reject-child-startup.mjs')).href,
      join(fixture, '.claude/hooks/format-file.mjs'),
    ],
    {
      input: JSON.stringify({
        cwd: fixture,
        tool_name: tool,
        tool_input: { file_path: file, edits: extraPaths.map((file_path) => ({ file_path })) },
      }),
      cwd: tmpdir(),
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    },
  );
}

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'budget-format-startup-'));
  cpSync(join(repoRoot, '.claude/hooks'), join(fixture, '.claude/hooks'), { recursive: true });
  symlinkSync(join(repoRoot, 'node_modules'), join(fixture, 'node_modules'), 'junction');
  write('.prettierignore', 'ignored/\n');
  write('.prettierrc.json', JSON.stringify({ singleQuote: true, semi: false, printWidth: 100 }));
  write('.editorconfig', 'root = true\n\n[*]\nindent_style = space\nindent_size = 4\n');
  // Deterministic startup failure: no npm, subprocess or wall-clock race is needed.
  write(
    'reject-child-startup.mjs',
    `import childProcess from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
for (const method of ['execFileSync', 'spawnSync', 'execFile', 'spawn', 'exec', 'execSync', 'fork']) {
  childProcess[method] = () => {
    appendFileSync(new URL('./child-startup-attempts', import.meta.url), method + '\\n');
    throw Object.assign(new Error('synthetic child startup timeout'), { code: 'ETIMEDOUT' });
  };
}
syncBuiltinESMExports();
`,
  );
});

afterAll(() => {
  if (!fixture) return;
  unlinkSync(join(fixture, 'node_modules'));
  rmSync(fixture, { recursive: true, force: true });
});

describe('format hook without formatter subprocess startup', () => {
  it('formats a spaced path from another cwd using local configuration and no subprocess', () => {
    const file = write('src/format me.ts', 'const synthetic={label:"fixture"};');
    const result = hook(file);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(readFileSync(file, 'utf8')).toBe("const synthetic = { label: 'fixture' }\n");
    expect(existsSync(join(fixture, 'child-startup-attempts'))).toBe(false);
  });

  it('preserves the CLI EditorConfig behavior', () => {
    const file = write('src/indent.ts', 'function synthetic(){return 1;}');
    const result = hook(file);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(readFileSync(file, 'utf8')).toBe('function synthetic() {\n    return 1\n}\n');
  });

  it.each(['ignored/skip.ts', 'src/skip.csv'])(
    'preserves ignored or unsupported input %s',
    (path) => {
      const file = write(path, 'synthetic  unformatted');
      const result = hook(file);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(readFileSync(file, 'utf8')).toBe('synthetic  unformatted');
    },
  );

  it('preserves ignored canonical paths accessed through an unignored symlink', () => {
    const file = write('ignored/secret.ts', 'synthetic  unformatted');
    const alias = join(fixture, 'alias');
    symlinkSync(join(fixture, 'ignored'), alias, 'junction');
    try {
      const result = hook(join(alias, 'secret.ts'));
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(readFileSync(file, 'utf8')).toBe('synthetic  unformatted');
    } finally {
      unlinkSync(alias);
    }
  });

  it('preserves outside paths, including an inside symlink to an outside directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'budget-format-outside-'));
    const file = join(outside, 'outside.ts');
    const alias = join(fixture, 'external');
    writeFileSync(file, 'synthetic  unformatted');
    symlinkSync(outside, alias, 'junction');
    try {
      for (const path of [file, join(alias, 'outside.ts')]) {
        const result = hook(path);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
      }
      expect(readFileSync(file, 'utf8')).toBe('synthetic  unformatted');
    } finally {
      unlinkSync(alias);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('retains invalid source without leaking its content or private path', () => {
    const source = 'const SYNTHETIC_PRIVATE_MARKER = ;';
    const file = write('src/private-marker.ts', source);
    const result = hook(file);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('edit kept');
    expect(result.stderr).not.toContain('SYNTHETIC_PRIVATE_MARKER');
    expect(result.stderr).not.toContain(file);
    expect(readFileSync(file, 'utf8')).toBe(source);
  });

  it('still formats valid MultiEdit siblings when an earlier file is invalid', () => {
    const broken = write('src/broken-multi.ts', 'const = ;');
    const valid = write('src/valid-multi.ts', 'const synthetic={count:1};');
    const result = hook(broken, 'MultiEdit', [valid]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('edit kept');
    expect(readFileSync(broken, 'utf8')).toBe('const = ;');
    expect(readFileSync(valid, 'utf8')).toBe('const synthetic = { count: 1 }\n');
  });
});
