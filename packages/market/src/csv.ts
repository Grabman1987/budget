/** One CSV line into fields: quoted fields may hold the separator and doubled quotes. */
export function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Header-keyed rows of a CSV text (no multi-line fields; the sources do not use them). */
export function parseCsv(text: string, separator: string): Record<string, string>[] {
  const plain = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = plain.split(/\r?\n/).filter((l) => l.trim() !== '');
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) return [];
  const header = splitCsvLine(headerLine, separator).map((h) => h.trim());
  return rows.map((row) => {
    const fields = splitCsvLine(row, separator);
    return Object.fromEntries(header.map((h, i) => [h, (fields[i] ?? '').trim()]));
  });
}
