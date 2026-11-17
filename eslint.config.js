import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Files that may still call Math.round (docs/rounding.md, inventory classes b and c, plus "left").
const MATH_ROUND_ALLOWED = [
  // c: time and test data
  'packages/domain/src/date/date.ts',
  'packages/db/src/repos/portfolio-report-fixture.ts',
  // b: display-only percentages, scores, index and micro-unit maths
  'packages/domain/src/kpi/age-of-money.ts',
  'packages/domain/src/report-tables/tables.ts',
  'packages/domain/src/reports/verdicts.ts',
  'packages/domain/src/rules/health.ts',
  'packages/domain/src/spending/coicop.ts',
  'packages/domain/src/spending/inflation.ts',
  'packages/domain/src/wealth/allocation-report.ts',
  'packages/db/src/repos/inflation-report.ts',
  'packages/db/src/repos/strategy-signal-evidence.ts',
  // a, left for later: float share input (ledger/alloc.ts) and a file other work is changing
  'packages/domain/src/ledger/alloc.ts',
  'packages/db/src/repos/rule-inputs.ts',
];

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
    // Rounding policy (docs/rounding.md): derived cents and units go through the exact helpers
    // `mulDivRound` / `roundDivCents`. `Math.round` is only for display ratios, index maths and time,
    // and only in the files listed below (class b/c of the inventory, plus the files still to migrate).
    files: ['packages/domain/src/**/*.ts', 'packages/db/src/**/*.ts'],
    ignores: ['**/*.test.ts', ...MATH_ROUND_ALLOWED],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message:
            'Use mulDivRound / roundDivCents (exact, half away from zero), see docs/rounding.md. Display-only ratios go to the allow-list in eslint.config.js.',
        },
      ],
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
      'apps/server/**/*.{ts,mjs}',
      'scripts/**/*.mjs',
      '.claude/hooks/**/*.mjs',
      'packages/*/scripts/**/*.mjs',
      '*.config.{js,ts}',
      'vitest.setup.ts',
    ],
    languageOptions: { globals: globals.node },
  },
);
