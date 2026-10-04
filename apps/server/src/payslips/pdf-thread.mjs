import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Runs off the HTTP thread. The parent kills this worker after a bounded extraction time.
const task = getDocument({
  data: new Uint8Array(workerData.bytes),
  password: workerData.password,
  isEvalSupported: false,
  disableFontFace: true,
  useSystemFonts: false,
  verbosity: 0,
});
try {
  const pdf = await task.promise;
  if (pdf.numPages > 30) throw new Error('limit');
  const rows = [];
  let length = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = new Map();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      // Preserve reading rows even when PDF text operators/cells have no newline markers.
      const y = Math.round(item.transform[5] / 2) * 2;
      const row = lines.get(y) ?? [];
      row.push({ x: item.transform[4], text: item.str });
      lines.set(y, row);
      length += item.str.length;
      if (length > 200000) throw new Error('limit');
    }
    for (const [, cells] of [...lines].sort(([a], [b]) => b - a)) {
      rows.push(
        cells
          .sort((a, b) => a.x - b.x)
          .map((v) => v.text)
          .join(' '),
      );
    }
    page.cleanup();
  }
  parentPort.postMessage({ text: rows.join('\n') });
} catch (error) {
  parentPort.postMessage({ error: error?.name === 'PasswordException' ? 'password' : 'pdf' });
} finally {
  await task.destroy();
}
