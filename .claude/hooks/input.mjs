import { realpathSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const editTools = new Set(['Edit', 'Write', 'MultiEdit']);

export async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4 * 1024 * 1024) throw new Error('input too large');
  }
  return JSON.parse(input);
}

function nativePath(value) {
  // Git Bash may supply /c/...; JSON may contain native Windows separators.
  if (process.platform === 'win32') {
    value = value.replace(/^\/([a-z])\//i, '$1:/');
  }
  return value.replaceAll('\\', '/');
}

function inside(root, file) {
  const rel = relative(root, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function canonicalPath(file) {
  // Resolve the nearest existing parent as Write can target a new file.
  let parent = file;
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) throw new Error('unresolvable path');
    parent = next;
  }
  return resolve(realpathSync(parent), relative(parent, file));
}

export function editedFiles(input, root = repoRoot, protect = false) {
  if (!editTools.has(input?.tool_name)) return [];
  const tool = input.tool_input;
  const paths = [tool?.file_path, ...(tool?.edits ?? []).map((edit) => edit.file_path)].filter(
    (file) => typeof file === 'string' && file.length > 0,
  );
  if (paths.length === 0) throw new Error('missing file_path');
  const cwd = typeof input.cwd === 'string' ? nativePath(input.cwd) : root;
  return [...new Set(paths)].flatMap((file) => {
    const lexical = resolve(cwd, nativePath(file));
    if (!inside(root, lexical)) return [];
    const canonical = canonicalPath(lexical);
    if (!inside(root, canonical) && !protect) return [];
    const checked = inside(root, canonical) ? [lexical, canonical] : [lexical];
    return [
      { file: canonical, paths: checked.map((path) => relative(root, path).replaceAll('\\', '/')) },
    ];
  });
}
