import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editedFiles, readInput, repoRoot } from './input.mjs';

const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.md', '.yml', '.yaml']);

export function shouldFormat(file, info) {
  return (
    extensions.has(extname(file).toLowerCase()) && !info.ignored && Boolean(info.inferredParser)
  );
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
  let failed = false;
  for (const file of targets) {
    try {
      // Reuse the pinned formatter already loaded for ignore checks. Starting npm and
      // a second Node process can exhaust the hook's budget on loaded Windows runners.
      const config = await prettier.resolveConfig(file, { editorconfig: true });
      const source = await readFile(file, 'utf8');
      const formatted = await prettier.format(source, { ...config, filepath: file });
      if (formatted !== source) await writeFile(file, formatted);
    } catch {
      // Keep invalid edits and still format other files in a MultiEdit.
      failed = true;
    }
  }
  if (failed) throw new Error('formatting failed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    // Formatter errors can contain source text or private paths.
    console.error(
      'Prettier: formatting skipped (local dependency, input, timeout or format error); edit kept. Run npm run format if needed.',
    );
  });
}
