import { describe, expect, it } from 'vitest';
import { planChecks } from './pre-push-check.mjs';

const names = (paths) => planChecks(paths).map((s) => s.name);

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
});
