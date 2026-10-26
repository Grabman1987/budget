import { getReceipt, type Db } from '@budget/db';
import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { digest, receiptPath, RECEIPT_LIMIT } from './files';

export type PdfPreviewCode =
  'password' | 'page' | 'limit' | 'busy' | 'unavailable' | 'source_changed' | 'aborted';
export type PdfPreviewInput = { page: number; preset: 'fit' | 'detail'; password?: string };
export type PdfPreview = {
  png: Uint8Array;
  page: number;
  pages: number;
  width: number;
  height: number;
};
export class PdfPreviewError extends Error {
  constructor(readonly code: PdfPreviewCode) {
    super('PDF preview unavailable');
  }
}

const OUTPUT_LIMIT = 8 * 1024 * 1024;
const TIME_LIMIT = 20_000;
// Process-wide admission, acquired before file I/O. There is deliberately no waiting queue.
let active = false;
const aborted = (signal: AbortSignal) => {
  if (signal.aborted)
    throw signal.reason instanceof PdfPreviewError ? signal.reason : new PdfPreviewError('aborted');
};

/** Read at most the recorded size + one byte, then verify THAT buffer, not an earlier file. */
async function sourceBytes(dir: string, sha256: string, size: number, signal: AbortSignal) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > RECEIPT_LIMIT)
    throw new PdfPreviewError('limit');
  const file = await open(receiptPath(dir, sha256), 'r');
  let bytes: Buffer | undefined;
  try {
    aborted(signal);
    const metadata = await file.stat();
    aborted(signal);
    if (!metadata.isFile() || metadata.size !== size) throw new PdfPreviewError('unavailable');
    bytes = Buffer.alloc(size + 1);
    let used = 0;
    while (used < bytes.length) {
      aborted(signal);
      const read = await file.read(bytes, used, bytes.length - used, used);
      if (!read.bytesRead) break;
      used += read.bytesRead;
    }
    aborted(signal);
    if (used !== size || digest(bytes.subarray(0, used)) !== sha256)
      throw new PdfPreviewError('unavailable');
    return bytes.subarray(0, used);
  } catch (error) {
    bytes?.fill(0);
    throw error;
  } finally {
    await file.close().catch((error: unknown) => {
      bytes?.fill(0);
      return Promise.reject(error);
    });
  }
}

function render(bytes: Uint8Array, sha256: string, input: PdfPreviewInput, signal: AbortSignal) {
  aborted(signal);
  const built = resolve(import.meta.dirname, 'pdf-preview-thread.js');
  const worker = new Worker(
    existsSync(built) ? built : resolve(import.meta.dirname, 'pdf-preview-thread.mjs'),
    {
      workerData: { bytes, sha256, ...input },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    },
  );
  // PDF/native diagnostics can contain private document data. Never forward them.
  worker.stdout?.resume();
  worker.stderr?.resume();
  return new Promise<PdfPreview>((done, fail) => {
    let finishing = false;
    const finish = (result: PdfPreview | PdfPreviewError) => {
      if (finishing) return;
      finishing = true;
      signal.removeEventListener('abort', cancel);
      // Capacity stays held until the actual worker has exited, including timeout/abort paths.
      void worker.terminate().then(
        () => (result instanceof PdfPreviewError ? fail(result) : done(result)),
        () => {
          // A failed termination request must not release admission while a worker is alive.
          if (worker.threadId === -1) fail(new PdfPreviewError('unavailable'));
          else worker.once('exit', () => fail(new PdfPreviewError('unavailable')));
        },
      );
    };
    const cancel = () =>
      finish(
        signal.reason instanceof PdfPreviewError ? signal.reason : new PdfPreviewError('aborted'),
      );
    worker.once('message', (message: unknown) => {
      if (!message || typeof message !== 'object')
        return finish(new PdfPreviewError('unavailable'));
      const data = message as Record<string, unknown>;
      if (['password', 'page', 'limit', 'unavailable'].includes(String(data['error'])))
        return finish(new PdfPreviewError(data['error'] as PdfPreviewCode));
      const { png, page, pages, width, height } = data;
      if (
        !(png instanceof Uint8Array) ||
        !png.length ||
        png.length > OUTPUT_LIMIT ||
        page !== input.page ||
        !Number.isInteger(pages) ||
        Number(pages) < input.page ||
        Number(pages) > 30 ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        Number(width) <= 0 ||
        Number(height) <= 0 ||
        Number(width) > 2048 ||
        Number(height) > 2048 ||
        png.length < 24 ||
        Buffer.from(png.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a' ||
        Buffer.from(png.subarray(16, 24)).readUInt32BE(0) !== width ||
        Buffer.from(png.subarray(16, 24)).readUInt32BE(4) !== height
      )
        return finish(new PdfPreviewError('unavailable'));
      finish({
        png,
        page: Number(page),
        pages: Number(pages),
        width: Number(width),
        height: Number(height),
      });
    });
    worker.once('error', () => finish(new PdfPreviewError('unavailable')));
    worker.once('exit', () => finish(new PdfPreviewError('unavailable')));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

/** Read-only inert pixels; no extraction, password retention, receipt mutation or audit write. */
export async function receiptPdfPreview(
  db: Db,
  dir: string,
  id: string,
  input: PdfPreviewInput,
  signal: AbortSignal,
): Promise<PdfPreview> {
  aborted(signal);
  if (active) throw new PdfPreviewError('busy');
  active = true;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new PdfPreviewError('limit')), TIME_LIMIT);
  const requestSignal = AbortSignal.any([signal, deadline.signal]);
  let bytes: Buffer | undefined;
  try {
    const source = getReceipt(db, id);
    if (source.mime !== 'application/pdf') throw new PdfPreviewError('unavailable');
    try {
      bytes = await sourceBytes(dir, source.sha256!, source.sizeBytes, requestSignal);
    } catch (error) {
      throw error instanceof PdfPreviewError ? error : new PdfPreviewError('unavailable');
    }
    let result: PdfPreview;
    try {
      result = await render(bytes, source.sha256!, input, requestSignal);
    } catch (error) {
      throw error instanceof PdfPreviewError ? error : new PdfPreviewError('unavailable');
    }
    aborted(requestSignal);
    // Rendering awaited I/O: never publish a source removed or replaced in the meantime.
    try {
      const live = getReceipt(db, id);
      if (
        live.sha256 !== source.sha256 ||
        live.sizeBytes !== source.sizeBytes ||
        live.mime !== source.mime
      )
        throw new PdfPreviewError('source_changed');
    } catch {
      result.png.fill(0);
      throw new PdfPreviewError('source_changed');
    }
    return result;
  } finally {
    clearTimeout(timer);
    bytes?.fill(0);
    // A pending bounded filesystem operation also completes/closes before this slot is freed.
    active = false;
  }
}
