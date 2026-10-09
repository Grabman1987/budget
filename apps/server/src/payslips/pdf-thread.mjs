import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Runs off the HTTP thread. The parent kills this worker after a bounded extraction time.
// Rows keep their column layout: a cell starts at the character column of its x position, so
// tables stay readable for the parser (amount columns line up under their headings).
const CELL = 5; // PDF points per character cell, close to the average glyph width of small print.
const ROW_TOLERANCE = 3; // Baselines closer than this belong to one row.
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
    const cells = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      cells.push({ x: item.transform[4], y: item.transform[5], text: item.str });
      length += item.str.length;
      if (length > 200000) throw new Error('limit');
    }
    // Top to bottom (PDF y grows upwards). Rows are rebuilt even without newline markers.
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const cell of cells) {
      const line = lines.at(-1);
      if (line && line.y - cell.y <= ROW_TOLERANCE) line.cells.push(cell);
      else lines.push({ y: cell.y, cells: [cell] });
    }
    for (const { cells: row } of lines) {
      let text = '';
      for (const cell of row.sort((a, b) => a.x - b.x)) {
        const column = Math.min(Math.max(Math.round(cell.x / CELL), 0), 400);
        if (column > text.length) text += ' '.repeat(column - text.length);
        else if (text && !text.endsWith(' ')) text += ' ';
        text += cell.text;
      }
      rows.push(text);
    }
    page.cleanup();
  }
  parentPort.postMessage({ text: rows.join('\n') });
} catch (error) {
  parentPort.postMessage({ error: error?.name === 'PasswordException' ? 'password' : 'pdf' });
} finally {
  await task.destroy();
}
