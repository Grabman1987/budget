# Test integrity gate and coverage ratchet

Workflow: `.github/workflows/test-integrity.yml`. Goal: agents may add tests, never weaken them to get green.

## Gate (`test-integrity` job, PRs only)

`scripts/ci/test-integrity.mjs` diffs the PR against its merge base. Test files are
`**/*.test.{ts,tsx,mjs}`, `e2e/**/*.ts`, `playwright.config.ts`, `vitest.config.ts`, `vitest.setup.ts`
and `e2e/**/*-snapshots/**`. Each violation is printed as `file:line reason` and fails the job:

- a deleted test file
- a removed or changed assertion line (`expect(`, `assert`, `.toBe`, `.toEqual` ...); a pure move in the same file is fine
- a removed or changed `test(` / `it(` / `describe(` declaration
- a newly added skip / only / fixme / todo / fail / `xit` / `xdescribe` / `{ skip`
- a changed line with `maxDiffPixelRatio`, `maxDiffPixels`, `threshold`, `toBeCloseTo(`, `retries` or `timeout`
- a modified or deleted screenshot baseline, unless the PR head branch is `bot/visual-baselines`
- any change to coverage settings in `vitest.config.ts`

Adding tests and assertions is always fine.

## Override

The owner adds the label `tests-change-approved` to the PR; the job then reports the violations as
warnings and passes. All agents act under the owner's GitHub account, so this is enforced by rule
and auditable in the PR timeline (label events), not technically. Use it only for a deliberate,
explained test change, and name the reason in the PR.

## Coverage ratchet (`coverage` job)

Runs `vitest --coverage` (v8, CLI flags only, `npm run test` is unchanged). On `main` the
`coverage-summary` artifact (90 days) is the baseline. A PR fails if line coverage is more than 0.1
points below the latest green run on `main`; without a baseline it passes with a notice.

## Locally

`node scripts/ci/test-integrity.mjs origin/main` (set `HEAD_REF` / `ALLOW_TEST_CHANGES=1` to mimic CI).
Unit tests: `npx vitest run scripts/ci`.
