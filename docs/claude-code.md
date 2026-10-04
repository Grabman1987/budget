# Claude Code project automation

The existing Impeccable marketplace/plugin remains enabled in `.claude/settings.json`.
Install repository dependencies with `npm ci` (`npm.cmd ci` in PowerShell when its
script policy blocks npm.ps1). Node and Git must be on PATH. The hooks use Claude
Code's shell-free `command` + `args` form; use a version supporting that form.
It works from Git Bash, PowerShell and Linux, including paths with spaces.
See the official [hook reference](https://code.claude.com/docs/en/hooks).

## Hooks

- `PostToolUse` on Edit/Write/MultiEdit formats in-repo ts, tsx, js, mjs, json, css,
  md and yml/yaml files when Prettier recognizes their parser. It honors the current
  `.prettierignore` (including Markdown and `.claude` exclusions), skips outside
  paths and symlink targets outside the repo, and uses installed Prettier through
  `npx --offline --no-install prettier --write`. npm gets an 800-ms budget and a
  repo-local node_modules cache; on failure/timeout the same installed Prettier CLI
  runs directly with Node (900-ms budget), with a short fallback note. This avoids
  slow npm startup/cache access on Windows. It never downloads, prints source
  content or fails the tool call; input/dependency/format errors produce a short
  stderr note and keep the edit.
- `PreToolUse` blocks in-repo `package-lock.json` and `.env`/`.env.*` at any depth
  except `.env.example`, plus `packages/db/drizzle/*.sql` and
  `packages/db/drizzle/meta/*.json` already tracked on the **local** origin/main.
  Exit 2 sends a German/English explanation. Use `npm install` / `npm run db:generate`;
  the owner manages secrets outside Edit/Write. New migrations are allowed. Git is
  queried locally only for migration paths with an 800-ms limit; no fetch/network.
  Invalid input or unavailable migration ancestry blocks with a bilingual diagnostic
  instead of declaring an unknown migration new. Fetch origin/main outside the hook
  before migration work. Drizzle-kit through Bash/PowerShell is unaffected.

Paths are relative to the hook input's cwd (the script's repository when omitted).
Both lexical and resolved in-repo paths are checked for protection. The scripts
reside under `.claude/hooks`, require no extra dependencies, and target typical
single-file hook runs below two seconds; Claude's outer timeout is three seconds.
These hooks guard editor tools, not arbitrary shell commands or a security boundary.
Start Claude inside the checkout/worktree you intend to edit; hooks stay scoped to
the checkout containing their scripts and skip paths outside it.
Run `npx vitest run scripts/claude-hooks.test.mjs` for synthetic stdin/CLI tests.

## User commands and reviewers

Both [pr-ship](../.claude/skills/pr-ship/SKILL.md) and
[live-op](../.claude/skills/live-op/SKILL.md) set `disable-model-invocation: true`;
only an explicit user invocation loads them. See the official
[skills reference](https://code.claude.com/docs/en/skills).

- `/pr-ship <branch> [delivery-source]`: import a reviewed Codex bundle/git directory
  if supplied, push/create a PR, classify failed CI, and merge with a merge commit
  only after check, check-windows, docker and restore-test are green on the verified
  head. It respects draft-only/no-merge instructions, polls at 180 seconds, retries
  known flakes once and verifies a 45-minute snapshot workflow before dispatch.
- `/live-op <app> <command> <private-json> <expectations>`: approval, disk/backup
  retention, verified upload, audited dry/real/idempotency runs and exact financial
  reconciliation. Private inputs/archives stay outside this public repository.
  There are no owner-specific app names, local paths or financial values in it.

Ask Claude to use `migration-reviewer` or `money-invariants-reviewer` for the
corresponding branch review. Each has only Read/Grep/Glob, as supported by the
[subagent tool allowlist](https://code.claude.com/docs/en/sub-agents), and needs the
calling agent's base/head diff and command evidence. They report findings; they
cannot run tests, modify the repo, ship or operate production. Existing local
`.agents/skills` profiles remain documented in [skills.md](skills.md).

Local Windows verification: 34 focused hook tests, full check (291 files / 2,808
tests) and build passed. The full check used `VITEST_MAX_WORKERS=2` and
`npm.cmd run check -- -- --testTimeout=30000` because default concurrency/deadlines
timed out existing tests in this sandbox; no repository defaults or assertions
changed. Measured single-file hooks: formatting 1.43 s including fallback, protection
0.14 s. Linux/Windows CI and an owner Claude-session smoke check remain separate.
