import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

// Per-surface and tracked live-pixel limits are not a native RSS or decoder-memory sandbox.
const SIDE = 2048;
const PIXELS = 4_194_304;
const LIVE_PIXELS = 16_777_216;
const OUTPUT = 8 * 1024 * 1024;
class PreviewLimit extends Error {}
class PreviewPage extends Error {}

function boundedFactory(factory) {
  if (
    !factory ||
    !['create', 'reset', 'destroy'].every((key) => typeof factory[key] === 'function')
  )
    throw new Error('renderer');
  const create = factory.create.bind(factory);
  const reset = factory.reset.bind(factory);
  const destroy = factory.destroy.bind(factory);
  const live = new Map();
  let total = 0;
  function size(width, height, previous = 0) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width > SIDE ||
      height > SIDE ||
      width * height > PIXELS ||
      total - previous + width * height > LIVE_PIXELS
    )
      throw new PreviewLimit();
    return width * height;
  }
  // Wrap the public PDFDocumentProxy factory instance, not a private/non-exported class.
  // PDF.js uses this same instance for output, masks, patterns and transparency surfaces.
  factory.create = (width, height) => {
    const pixels = size(width, height);
    const entry = create(width, height);
    live.set(entry.canvas, pixels);
    total += pixels;
    return entry;
  };
  factory.reset = (entry, width, height) => {
    const previous = live.get(entry.canvas);
    if (previous === undefined) throw new PreviewLimit();
    const pixels = size(width, height, previous);
    reset(entry, width, height);
    live.set(entry.canvas, pixels);
    total += pixels - previous;
  };
  factory.destroy = (entry) => {
    const canvas = entry.canvas;
    const pixels = live.get(canvas);
    if (pixels === undefined) {
      if (canvas?.width === 0 && canvas?.height === 0) return;
      throw new PreviewLimit();
    }
    destroy(entry);
    live.delete(canvas);
    total -= pixels;
  };
  return () => {
    for (const canvas of live.keys()) destroy({ canvas, context: null });
    live.clear();
    total = 0;
  };
}

let task;
let page;
let release;
try {
  const { bytes, sha256, password, preset, page: number } = workerData;
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 15 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    createHash('sha256').update(bytes).digest('hex') !== sha256 ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > 30 ||
    !['fit', 'detail'].includes(preset) ||
    (password !== undefined && (typeof password !== 'string' || password.length > 1024))
  )
    throw new PreviewLimit();
  const { getDocument, AnnotationMode } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
  task = getDocument({
    data: bytes,
    password,
    isEvalSupported: false,
    enableXfa: false,
    enableHWA: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    maxImageSize: PIXELS,
    canvasMaxAreaInBytes: PIXELS * 4,
    stopAtErrors: true,
    standardFontDataUrl: resolve(root, 'standard_fonts') + '/',
    cMapUrl: resolve(root, 'cmaps') + '/',
    cMapPacked: true,
    wasmUrl: resolve(root, 'wasm') + '/',
    verbosity: 0,
  });
  const pdf = await task.promise;
  if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages > 30) throw new PreviewLimit();
  if (number > pdf.numPages) throw new PreviewPage();
  release = boundedFactory(pdf.canvasFactory);
  page = await pdf.getPage(number);
  if (!Number.isInteger(page.rotate) || page.rotate % 90 !== 0) throw new PreviewLimit();
  const raw = page.getViewport({ scale: 1 });
  if (
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  )
    throw new PreviewLimit();
  const scale = Math.min((preset === 'detail' ? 1536 : 960) / raw.width, SIDE / raw.height);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width),
    height = Math.ceil(viewport.height);
  const entry = pdf.canvasFactory.create(width, height);
  await page.render({
    canvas: entry.canvas,
    viewport,
    annotationMode: AnnotationMode.DISABLE,
    background: 'rgb(255,255,255)',
  }).promise;
  if (typeof entry.canvas.toBuffer !== 'function') throw new Error('renderer');
  const png = entry.canvas.toBuffer('image/png');
  if (!png.length || png.length > OUTPUT) throw new PreviewLimit();
  const transfer = Uint8Array.from(png);
  parentPort.postMessage({ png: transfer, page: number, pages: pdf.numPages, width, height }, [
    transfer.buffer,
  ]);
} catch (error) {
  parentPort.postMessage({
    error:
      error?.name === 'PasswordException'
        ? 'password'
        : error instanceof PreviewPage
          ? 'page'
          : error instanceof PreviewLimit
            ? 'limit'
            : 'unavailable',
  });
} finally {
  try {
    release?.();
  } catch {
    /* No library diagnostics may leave this worker. */
  }
  try {
    page?.cleanup();
  } catch {
    /* Parent owns final termination. */
  }
  try {
    await task?.destroy();
  } catch {
    /* Parent owns final termination. */
  }
}
