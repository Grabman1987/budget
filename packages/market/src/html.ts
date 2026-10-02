import { MarketError } from './errors';

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  euro: '€',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  pound: '£',
  yen: '¥',
};

const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** Visible text of a cell: tags dropped, entities decoded, white space collapsed. */
export const cellText = (inner: string): string =>
  decode(inner.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The rows of the first table that has a header row holding every name in `header`, as cell text
 * (header row first). Throws `parse` when no such table exists: a consent page, a login page or
 * a redesign must not be mistaken for "no prices".
 */
export function tableWithHeader(html: string, header: readonly string[]): string[][] {
  const tables = html.split(/<table\b/i).slice(1);
  for (const table of tables) {
    const body = table.slice(
      0,
      table.search(/<\/table>/i) >= 0 ? table.search(/<\/table>/i) : undefined,
    );
    const rows: string[][] = [];
    for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
      rows.push(
        [...(row[1] as string).matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
          cellText(c[1] as string),
        ),
      );
    const at = rows.findIndex((r) => header.every((h) => r.includes(h)));
    if (at >= 0) return rows.slice(at);
  }
  throw new MarketError('parse', 'no price table');
}
