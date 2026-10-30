import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planChecks } from './pre-push-check.mjs';

const names = (paths) => planChecks(paths).map((s) => s.name);

it('the real CLI rejects a delete-only app change whose route and test ID remain in an unchanged e2e spec', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'budget-prepush-delete-'));
  if (!resolve(sandbox).startsWith(resolve(tmpdir()) + sep + 'budget-prepush-delete-')) {
    throw new Error('Refusing cleanup outside the synthetic temporary repository');
  }
  const env = { ...process.env, BUDGET_SKIP_PREPUSH: '0', BUDGET_PREPUSH_ALLOW_REMOVED: '' };
  // A gate invoked by Git must not pass its outer repository context to this synthetic repository.
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const git = (args) =>
    execFileSync('git', args, {
      cwd: sandbox,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    git(['init', '--quiet']);
    git(['config', 'user.name', 'Synthetic gate fixture']);
    git(['config', 'user.email', 'gate-fixture@example.invalid']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'core.hooksPath', '.git/no-hooks']);
    mkdirSync(join(sandbox, 'apps/web/src'), { recursive: true });
    mkdirSync(join(sandbox, 'e2e'));
    mkdirSync(join(sandbox, 'node_modules'));
    const app = 'apps/web/src/deleted-only.tsx';
    writeFileSync(
      join(sandbox, app),
      '<a href="/reports/prepush-deleted-only" data-testid="prepush-deleted-only">Synthetic</a>\n',
    );
    writeFileSync(
      join(sandbox, 'e2e/unchanged.spec.ts'),
      "await page.goto('/reports/prepush-deleted-only');\nawait expect(page.getByTestId('prepush-deleted-only')).toBeVisible();\n",
    );
    git(['add', 'apps', 'e2e']);
    git(['commit', '--quiet', '-m', 'Synthetic original contract']);
    const base = git(['rev-parse', 'HEAD']).trim();
    git(['rm', '--quiet', app]);
    git(['commit', '--quiet', '-m', 'Delete only the synthetic application file']);
    expect(git(['diff', '--name-status', base, 'HEAD']).trim()).toBe(`D\t${app}`);
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./pre-push-check.mjs', import.meta.url)), '--base', base],
      { cwd: sandbox, env, encoding: 'utf8' },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"/reports/prepush-deleted-only" was removed from the app');
    expect(result.stderr).toContain('"prepush-deleted-only" was removed from the app');
    expect(result.stderr).toContain('e2e/unchanged.spec.ts');
    expect(result.stdout).not.toContain('> ');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe('pre-push plan', () => {
  it('plans nothing for unrelated files', () => {
    expect(planChecks(['LICENSE', 'docs/image.png'])).toEqual([]);
  });

  it('formats markdown without running code checks', () => {
    expect(names(['docs/status.md'])).toEqual(['prettier (changed files)']);
  });

  it('runs typecheck, lint, format and related tests for source changes', () => {
    expect(names(['apps/web/src/router.tsx'])).toEqual([
      'typecheck',
      'eslint (changed files)',
      'prettier (changed files)',
      'unit tests related to the change',
    ]);
  });

  it('adds the css scale check for stylesheets only', () => {
    expect(names(['apps/web/src/styles.css'])).toContain('css scale');
    expect(names(['apps/web/src/router.tsx'])).not.toContain('css scale');
  });

  it('passes each changed file as its own argument, never through a shell string', () => {
    const lint = planChecks(['a b.ts']).find((s) => s.name.startsWith('eslint'));
    expect(lint.cmd.at(-1)).toBe('a b.ts');
  });

  it('ignores vendored dependencies', () => {
    expect(planChecks(['node_modules/x/index.js'])).toEqual([]);
  });

  it('drops file names that cmd.exe would re-parse, on Windows only', () => {
    const risky = ['apps/a&b.ts', 'apps/ok.ts'];
    const lint = (opts) => planChecks(risky, opts).find((s) => s.name.startsWith('eslint')).cmd;
    expect(lint({ windows: true })).toEqual([
      'npx',
      'eslint',
      '--no-warn-ignored',
      '--',
      'apps/ok.ts',
    ]);
    expect(lint({})).toContain('apps/a&b.ts');
  });

  it('ends option parsing before the file list', () => {
    const lint = planChecks(['-odd.ts']).find((s) => s.name.startsWith('eslint'));
    expect(lint.cmd.indexOf('--')).toBeLessThan(lint.cmd.indexOf('-odd.ts'));
  });
});
