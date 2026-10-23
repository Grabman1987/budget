import { open, readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractStatement } from '../apps/server/src/statements/service';
import { RECEIPT_LIMIT } from '../apps/server/src/receipts/files';

const unsupportedPlatform = 'unsupported_private_output_platform';
const unsupportedMessage =
  'Private extraction is unavailable on Windows; use a POSIX environment with a private output directory.\n';

/** Private POSIX-only extraction. Invoke with node --import tsx; output never goes to stdout. */
export async function statementExtract(args: string[], stdin: AsyncIterable<Uint8Array>) {
  if (process.platform === 'win32') throw new Error(unsupportedPlatform);
  const passwordInput = args.includes('--password-stdin'),
    paths = args.filter((a) => a !== '--password-stdin');
  if (paths.length !== 2 || args.some((a) => a.startsWith('--') && a !== '--password-stdin'))
    throw new Error('usage');
  const source = resolve(paths[0]!),
    target = resolve(paths[1]!);
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > RECEIPT_LIMIT)
    throw new Error('invalid');
  let password: string | undefined;
  if (passwordInput) {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of stdin) {
      length += chunk.length;
      if (length > 1024) throw new Error('password_limit');
      chunks.push(Buffer.from(chunk));
    }
    password = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  const bytes = await readFile(source);
  if (bytes.length > RECEIPT_LIMIT) throw new Error('limit');
  const proposal = await extractStatement(bytes, password);
  password = undefined;
  const out = await open(target, 'wx', 0o600);
  try {
    await out.writeFile(JSON.stringify(proposal, null, 2) + '\n');
    await out.sync();
  } finally {
    await out.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  statementExtract(process.argv.slice(2), process.stdin).then(
    () => {
      process.stdout.write('Extraction saved privately.\n');
    },
    (error: unknown) => {
      process.stderr.write(
        error instanceof Error && error.message === unsupportedPlatform
          ? unsupportedMessage
          : 'Extraction failed; check input, password or private output path.\n',
      );
      process.exitCode = 1;
    },
  );
