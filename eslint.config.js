import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'design/**',
      'reference/**',
      'docs/**',
      '.impeccable/**',
      // Local operator files (git-ignored): real data and one-off scripts.
      'private/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Strict CSP: no dynamic code evaluation anywhere (SPEC §2, §9).
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/public/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Accessibility rules for every piece of UI (audit D8); axe checks the rendered pages in e2e.
    ...jsxA11y.flatConfigs.recommended,
    files: ['apps/web/**/*.tsx', 'packages/ui/**/*.tsx'],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [
      'apps/server/**/*.ts',
      'scripts/**/*.mjs',
      'packages/*/scripts/**/*.mjs',
      '*.config.{js,ts}',
      'vitest.setup.ts',
    ],
    languageOptions: { globals: globals.node },
  },
);
