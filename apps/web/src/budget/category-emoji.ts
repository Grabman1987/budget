/**
 * Display-only emoji for a category without an explicit icon. Matches the start of a word in the
 * name (de-AT), first match wins; nothing is stored. An explicit icon always takes precedence.
 */
const BY_NAME: ReadonlyArray<readonly [string, string]> = [
  ['gesundheit|arzt|ärzt|apotheke|medizin|medikament|zahnarzt|therapie|krank', '🩺'],
  ['restaurant|lokal|gastro|lieferdienst|take.?away|essen gehen', '🍽'],
  ['lebensmittel|supermarkt|einkauf|haushaltswaren|essen|verpflegung', '🛒'],
  ['kaffee|café|cafe', '☕'],
  ['miete|wohn|nebenkosten|betriebskosten', '🏠'],
  ['strom|energie|heizung|fernwärme|gas$', '💡'],
  ['internet|handy|telefon|mobilfunk|smartphone', '📱'],
  ['auto|kfz|pkw|benzin|diesel|treibstoff|tank|parken|maut|vignette|werkstatt', '🚗'],
  ['öffi|bahn|bus(?![a-zäöüß])|ticket|verkehr|fahrrad|mobilität', '🚆'],
  ['versicherung|haftpflicht', '🛡'],
  ['urlaub|reise|ferien|hotel|flug', '✈'],
  ['kleidung|kleider|schuhe|mode', '👕'],
  ['kind|baby|schule|kinder', '👶'],
  ['geschenk|spende|feier', '🎁'],
  ['freizeit|hobby|unterhaltung|kino|ausgehen|spaß|spass', '🎉'],
  ['sport|fitness|gym', '🏋'],
  ['abo|streaming|netflix|zeitung|medien', '📺'],
  ['bildung|kurs|buch|bücher|weiterbildung|studium', '📚'],
  ['haustier|tier|hund|katze', '🐾'],
  ['friseur|körperpflege|drogerie|kosmetik|hygiene', '🧴'],
  ['steuer|finanzamt|abgabe|gebühr(?:en)?$', '🧾'],
  ['bank|konto|zinsen|kredit|darlehen', '🏦'],
  ['spar|rücklage|ruecklage|notgroschen|investi|vorsorge|zukunft|etf|depot', '📈'],
  ['haus(?!halt)|garten|reparatur|instandhaltung|renovier|möbel|werkzeug|periodisch', '🔧'],
  ['gehalt|lohn|einkommen|nebenprojekt|arbeit|beruf', '💼'],
];

/** Shown for categories that have neither an explicit icon nor a name match. */
export const FALLBACK_CATEGORY_EMOJI = '🏷';

const RULES = BY_NAME.map(
  ([words, emoji]) => [new RegExp(`(?<![a-zäöüß])(?:${words})`, 'iu'), emoji] as const,
);

/** The explicit icon, else an emoji that fits the name, else the neutral fallback. */
export function categoryEmoji(name: string, icon?: string | null): string {
  const explicit = icon?.trim();
  if (explicit) return explicit;
  for (const [pattern, emoji] of RULES) if (pattern.test(name)) return emoji;
  return FALLBACK_CATEGORY_EMOJI;
}
