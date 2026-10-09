/** Ordered-character search: abbreviations work without interpreting regex or SQL syntax. */
export function matchesSearch(label: string, query: string): boolean {
  const text = label.toLocaleLowerCase('de-AT').replaceAll('−', '-');
  let position = 0;
  for (const character of query.trim().toLocaleLowerCase('de-AT').replaceAll('−', '-')) {
    position = text.indexOf(character, position);
    if (position < 0) return false;
    position++;
  }
  return true;
}
