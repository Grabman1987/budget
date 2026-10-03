/**
 * German text for an answer of the API. The server sends a `message`, but not all of them are
 * German or fit for the screen: generic ones ("The request is not valid", "Something went wrong")
 * and anything with technical ids never reach the UI. The code of the answer decides instead.
 */
const CODE_TEXT: Record<string, string> = {
  invalid: 'Die Eingabe ist ungültig.',
  invalid_range: 'Der Zeitraum ist ungültig.',
  not_found: 'Der Eintrag wurde nicht gefunden.',
  conflict: 'Das geht gerade nicht, weil sich die Daten inzwischen geändert haben.',
  constraint: 'Die Daten verletzen eine Regel des Kassenbuchs.',
  invariant: 'Die Eingabe verletzt eine Regel des Kassenbuchs.',
  undo_refused: 'Rückgängig machen ist nicht mehr möglich.',
  valuation_unavailable: 'Die Bewertung ist gerade nicht möglich: Es fehlt ein Wechselkurs.',
  server_error: 'Auf dem Server ist ein Fehler aufgetreten. Versuch es später noch einmal.',
  network: 'Keine Verbindung zum Server.',
  unauthorized: 'Bitte melde dich neu an.',
};

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const ENGLISH =
  /\b(the|is|are|was|were|not|no|must|should|please|could|couldn't|failed|cannot|found|already|exists?|request|server|error|something|went|wrong|price|rate|before|valid|invalid|missing|unknown|upload|file|run|job)\b/i;
const GERMAN =
  /[äöüß]|\b(der|die|das|dem|den|ein|eine|einen|nicht|kein|keine|bitte|ist|sind|wurde|für|bis|und|oder|fehlt|noch|zu|mit|von|im|am)\b/i;

/** A server message that is fit for the screen: German and free of technical ids. */
export function isUserText(message: string): boolean {
  if (UUID.test(message)) return false;
  if (GERMAN.test(message)) return true;
  return !ENGLISH.test(message);
}

export interface ApiErrorLike {
  status?: number;
  code?: string;
  detail?: string | undefined;
}

/**
 * The German text of an API error, or `undefined` when there is nothing better to say than the
 * caller's own fallback.
 */
export function apiErrorText(error: ApiErrorLike): string | undefined {
  if (error.status === 0) return CODE_TEXT['network'];
  if (error.detail && isUserText(error.detail)) return error.detail;
  if (error.code && CODE_TEXT[error.code]) return CODE_TEXT[error.code];
  if (error.status !== undefined && error.status >= 500) return CODE_TEXT['server_error'];
  return undefined;
}

/**
 * German text for any message a page might render raw, e.g. `netWorthUnavailable` of a report:
 * the message when it is fit for the screen, otherwise the fallback.
 */
export function userText(message: string | null | undefined, fallback: string): string {
  return message && isUserText(message) ? message : fallback;
}
