// Only disposable queue-test children use this observer. Bash's built-in clock avoids
// spawning a date/Node process for each phase, including on Git for Windows.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function mockExecutable(body) {
  return `#!/usr/bin/env bash
printf '%s mock-enter\\n' "$EPOCHREALTIME" >> "$QUEUE_TEST_PHASES"
trap 'printf "%s mock-exit\\n" "$EPOCHREALTIME" >> "$QUEUE_TEST_PHASES"' EXIT
${body}
`;
}

export function runFixture(bash, args, options, label) {
  const phases = join(options.cwd, '.test-phases');
  const startup = join(options.cwd, '.test-startup');
  writeFileSync(phases, '');
  writeFileSync(startup, 'printf \'%s shell-entry\\n\' "$EPOCHREALTIME" >> "$QUEUE_TEST_PHASES"\n');
  const start = Date.now();
  const result = spawnSync(bash, args, {
    ...options,
    env: {
      ...options.env,
      BASH_ENV: startup.replace(/\\/g, '/'),
      QUEUE_TEST_PHASES: phases.replace(/\\/g, '/'),
    },
  });
  const total = Date.now() - start;
  const events = readFileSync(phases, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const [time, phase] = line.split(' ');
      return { ms: Number(time) * 1000, phase };
    });
  const shells = events.filter((e) => e.phase === 'shell-entry');
  let entered;
  let mockMs = 0;
  for (const event of events) {
    if (event.phase === 'mock-enter') entered = event.ms;
    if (event.phase === 'mock-exit' && entered !== undefined) {
      mockMs += event.ms - entered;
      entered = undefined;
    }
  }
  // One bounded numeric record per child; no command arguments, paths or API data.
  if (process.platform === 'win32' || process.env.BUDGET_QUEUE_TEST_TIMINGS === '1') {
    console.info(
      'queue-fixture',
      JSON.stringify({
        label,
        platform: process.platform,
        totalMs: total,
        startupMs: shells.length ? Math.round(shells[0].ms - start) : null,
        shellStarts: shells.length,
        mockBodyMs: Math.round(mockMs),
        error: result.error?.code ?? null,
      }),
    );
  }
  return result;
}
