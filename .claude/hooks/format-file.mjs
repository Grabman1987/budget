import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editedFiles, readInput, repoRoot } from './input.mjs';

const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.md', '.yml', '.yaml']);

export function shouldFormat(file, info) {
  return (
    extensions.has(extname(file).toLowerCase()) && !info.ignored && Boolean(info.inferredParser)
  );
}

function npxCommand() {
  if (process.platform !== 'win32') return ['npx', []];
  // .cmd cannot be execFile'd on Windows. Run npm's installed npx JS entry without a shell.
  const dirs = [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)];
  for (const dir of dirs) {
    const cli = join(dir.replace(/^"|"$/g, ''), 'node_modules/npm/bin/npx-cli.js');
    if (existsSync(cli)) return [process.execPath, [cli]];
  }
  throw new Error('npx unavailable');
}

async function main() {
  const files = editedFiles(await readInput()).filter(({ file }) =>
    extensions.has(extname(file).toLowerCase()),
  );
  if (!files.length) return;
  const prettierPath = join(repoRoot, 'node_modules/prettier/index.mjs');
  if (!existsSync(prettierPath)) throw new Error('local prettier unavailable');
  const prettier = await import(pathToFileURL(prettierPath).href);
  const ignorePath = join(repoRoot, '.prettierignore');
  const targets = [];
  for (const { file, paths } of files) {
    const infos = await Promise.all(
      paths.map((path) =>
        prettier.getFileInfo(join(repoRoot, path), { ignorePath, resolveConfig: false }),
      ),
    );
    if (infos.every((info) => shouldFormat(file, info))) targets.push(file);
  }
  if (!targets.length) return;
  const args = ['--write', '--ignore-path', ignorePath, ...targets];
  const options = {
    cwd: repoRoot,
    windowsHide: true,
    // Ignored output avoids private source text and inherited pipe waits on timeout.
    stdio: 'ignore',
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_update_notifier: 'false',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_logs_max: '0',
      npm_config_cache: join(repoRoot, 'node_modules/.cache/claude-hooks'),
    },
  };
  try {
    const [command, prefix] = npxCommand();
    execFileSync(command, [...prefix, '--offline', '--no-install', 'prettier', ...args], {
      ...options,
      timeout: 800,
    });
  } catch {
    // npm startup alone exceeds two seconds on some Windows installations.
    // Use the same pinned local CLI, never a download or another formatter.
    execFileSync(
      process.execPath,
      [join(repoRoot, 'node_modules/prettier/bin/prettier.cjs'), ...args],
      { ...options, timeout: 900 },
    );
    console.error('Prettier: npx failed/timed out; formatted with the installed local CLI.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    // Do not print child output: it can contain source text or private paths.
    console.error(
      'Prettier: formatting skipped (local dependency, input, timeout or format error); edit kept. Run npm run format if needed.',
    );
  });
}
