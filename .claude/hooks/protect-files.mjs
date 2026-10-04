import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editedFiles, readInput, repoRoot } from './input.mjs';

export function isMigration(path) {
  return /^packages\/db\/drizzle\/(?:[^/]+\.sql|meta\/[^/]+\.json)$/.test(path);
}

export function blockReason(path, mainFiles) {
  const name = basename(path);
  if (name === 'package-lock.json') return 'lockfile';
  if (name !== '.env.example' && (name === '.env' || name.startsWith('.env.')))
    return 'environment';
  if (isMigration(path) && mainFiles.has(path)) return 'migration';
  return null;
}

async function main() {
  const files = editedFiles(await readInput(), repoRoot, true);
  // Windows filesystem paths are case-insensitive, Git tree entries are not.
  const paths = files
    .flatMap(({ paths }) => paths)
    .map((path) => (process.platform === 'win32' ? path.toLowerCase() : path));
  let mainFiles = new Set();
  if (paths.some(isMigration)) {
    const tree = execFileSync(
      'git',
      ['ls-tree', '-r', '-z', '--name-only', 'origin/main', '--', 'packages/db/drizzle'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 800,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    mainFiles = new Set(
      tree.split('\0').map((path) => (process.platform === 'win32' ? path.toLowerCase() : path)),
    );
  }
  if (paths.some((path) => blockReason(path, mainFiles))) {
    console.error(
      'Geschützte Datei / Protected file: keine Handänderung / no hand edits. Migrationen: npm run db:generate; Lockfile: npm install. .env: lokal durch den Besitzer / owner-managed secrets; use .env.example for documentation.',
    );
    process.exitCode = 2;
  }
}

// Only these CLI entry points read stdin; the decision helpers are importable in tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    console.error(
      'Dateischutz konnte nicht geprüft werden / File protection could not be verified. Änderung gestoppt / edit blocked. Check hook JSON and local origin/main; use npm run db:generate / npm install.',
    );
    process.exitCode = 2;
  });
}
