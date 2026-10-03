import type { RuleCode } from './params';

/**
 * The default rule book (concept §3.5, prototype `einstellungen.js` and `reports-core.js`): name,
 * stage (1 Fundament, 2 Aufbau, 3 Freiheit), goal text and the fallback action. The parameters
 * come from `defaultParams`. Rules are data: `ensureDefaultRules` writes these once.
 */
export interface RuleDef {
  code: RuleCode;
  name: string;
  stage: 1 | 2 | 3;
  goal: string;
  /** Action when the engine has nothing more specific to say. */
  action: string;
}

export const RULE_DEFS: ReadonlyArray<RuleDef> = [
  {
    code: 'R01',
    name: '50/30/20',
    stage: 2,
    goal: 'Ziel 50 / 30 / 20',
    action: 'Wunsch-Envelopes kürzen, bis die Anteile wieder passen.',
  },
  {
    code: 'R02',
    name: 'Notgroschen',
    stage: 2,
    goal: 'min. 3, Ziel 6 Monate',
    action: 'Notgroschen-Rate erhöhen, bis 3 Monate Bedarf erreicht sind.',
  },
  {
    code: 'R03',
    name: 'Vom Vormonat leben',
    stage: 2,
    goal: 'Ziel ≥ 30 Tage',
    action: 'Puffer im Budget-Konto aufbauen, Überschüsse erst ab 30 Tagen Geldalter abziehen.',
  },
  {
    code: 'R04',
    name: 'Pay yourself first',
    stage: 1,
    goal: 'Zukunft zuerst',
    action: 'Zukunft-Envelopes am Gehaltstag zuerst füllen.',
  },
  {
    code: 'R05',
    name: 'Sinking Funds',
    stage: 2,
    goal: 'alle bei Fälligkeit',
    action: 'Rücklagen für periodische Ausgaben aufstocken.',
  },
  {
    code: 'R06',
    name: 'Kreditkarte',
    stage: 1,
    goal: 'immer gedeckt',
    action: 'Kartenzahlung aufstocken, bis der Saldo gedeckt ist.',
  },
  {
    code: 'R07',
    name: 'Dispo',
    stage: 1,
    goal: '≥ 0 € in 90 Tagen',
    action: 'Zahlungen verschieben oder Geld auf das Budget-Konto übertragen.',
  },
  {
    code: 'R08',
    name: 'Schuldenquote',
    stage: 2,
    goal: '≤ 30 %',
    action: 'Kreditraten prüfen: Laufzeit oder Umschuldung.',
  },
  {
    code: 'R09',
    name: 'Tilgungsreihenfolge',
    stage: 2,
    goal: 'Zins > 5 %: tilgen',
    action: 'Sondertilgung für Kredite über 5 % Zins vor dem Investieren einplanen.',
  },
  {
    code: 'R10',
    name: 'Fixkostenquote',
    stage: 2,
    goal: '≤ 55 %',
    action: 'Verträge und Fixkosten prüfen.',
  },
  {
    code: 'R11',
    name: 'Lifestyle-Inflation',
    stage: 3,
    goal: 'Ausgaben ≤ Einkommen',
    action: 'Neue Ausgaben nur aus dem Einkommenszuwachs finanzieren.',
  },
  {
    code: 'R12',
    name: 'Windfall',
    stage: 2,
    goal: '10 % Genuss',
    action: 'Sonderzahlung verteilen: 10 % Genuss, der Rest nach Wasserfall.',
  },
  {
    code: 'R13',
    name: 'Asset Allocation',
    stage: 3,
    goal: '≤ 5 Pp Abweichung',
    action: 'Nächste Sparrate in die untergewichtete Klasse lenken.',
  },
  {
    code: 'R14',
    name: 'Klumpenrisiko',
    stage: 2,
    goal: 'Einzeltitel ≤ 10 %',
    action: 'Große Einzelpositionen nicht weiter aufstocken.',
  },
  {
    code: 'R15',
    name: 'Spekulativer Anteil',
    stage: 2,
    goal: '≤ 10 %',
    action: 'Keine neuen Käufe in Krypto, P2P, Einzelaktien; Sparplan nur ETF.',
  },
  {
    code: 'R16',
    name: 'Freiheitszahl',
    stage: 3,
    goal: 'Fortschritt steigt',
    action: 'Sparrate prüfen: der Fortschritt zur Freiheitszahl ist gesunken.',
  },
  {
    code: 'R17',
    name: 'Investitionsquote vom Brutto',
    stage: 2,
    goal: 'Ziel 25 %, mindestens 15 %',
    action: 'Sparplan bis zum Bruttoziel erhöhen.',
  },
  {
    code: 'R18',
    name: 'Vermögensindex',
    stage: 2,
    goal: 'Richtwert Index 1,0; nur Warnung',
    action: 'Abstand zum Richtwert prüfen.',
  },
  {
    code: 'R19',
    name: 'Grenz-Sparquote',
    stage: 3,
    goal: 'Mindestens 50 % des Zuwachses sparen',
    action: 'Mehr vom Einkommenszuwachs für Zukunft zuweisen.',
  },
  {
    code: 'R20',
    name: 'Regelmäßig investieren',
    stage: 2,
    goal: '11 von 12 Monaten',
    action: 'Sparplan und vollständige Tradehistorie prüfen.',
  },
  {
    code: 'R21',
    name: 'Hebel und Fremdkapital',
    stage: 2,
    goal: 'Hebel ≤ 10 %, kein Plattform-Minus',
    action: 'Hebelanteil und Verrechnungskonten prüfen.',
  },
  {
    code: 'R22',
    name: 'Fondskosten',
    stage: 3,
    goal: 'Kostenquote ≤ 0,30 %',
    action: 'TER prüfen und günstigere Fonds erwägen.',
  },
];

/**
 * A stage checklist item (`einstellungen.js` STAGES; the books are the sources). Items with a
 * `ruleCode` take their status from that rule; the others cannot be computed and the owner
 * confirms them as erledigt (owner decision 01.10.2026), after which they count in the Finanz-Check.
 */
export interface ChecklistDef {
  /** Stable key `S<stage>-<n>`, stored as the rule code. */
  code: string;
  stage: 1 | 2 | 3;
  text: string;
  source: string;
  ruleCode: RuleCode | null;
  /** All linked rules must be ok (S3-2: costs plus allocation). */
  additionalRuleCodes?: ReadonlyArray<RuleCode>;
}

export const CHECKLIST_DEFS: ReadonlyArray<ChecklistDef> = [
  {
    code: 'S1-1',
    stage: 1,
    text: 'Nudel-Budget kennen: das Nötigste je Monat',
    source: 'Get Good with Money',
    ruleCode: null,
  },
  {
    code: 'S1-2',
    stage: 1,
    text: 'Starter-Notgroschen: 1 Monat Nudel-Budget',
    source: 'Get Good with Money',
    ruleCode: null,
  },
  {
    code: 'S1-3',
    stage: 1,
    text: 'Kreditkarte immer voll zurückzahlen',
    source: 'I Will Teach You to Be Rich',
    ruleCode: 'R06',
  },
  {
    code: 'S1-4',
    stage: 1,
    text: 'Am Gehaltstag automatisch verteilen',
    source: 'I Will Teach You to Be Rich',
    ruleCode: 'R04',
  },
  {
    code: 'S2-1',
    stage: 2,
    text: 'Bruttoziel investieren (inkl. Arbeitgeberbeitrag)',
    source: 'Financial Order of Operations',
    ruleCode: 'R17',
  },
  {
    code: 'S2-2',
    stage: 2,
    text: 'Notgroschen 3 bis 6 Monate Bedarf',
    source: 'Get Good with Money',
    ruleCode: 'R02',
  },
  {
    code: 'S2-3',
    stage: 2,
    text: 'Bewusster Ausgabenplan (Fixkosten R10, Investieren R17): Fix 50–60 %, Investieren ≥ 10 %, Genuss 20–35 %',
    source: 'I Will Teach You to Be Rich',
    ruleCode: 'R01',
  },
  {
    code: 'S2-4',
    stage: 2,
    text: 'Kredite über 5 % zuerst tilgen, kein Konsum- oder Autokredit',
    source: 'Everyday Millionaires',
    ruleCode: 'R09',
  },
  {
    code: 'S2-5',
    stage: 2,
    text: 'Echten Stundenlohn kennen, Ausgaben in Lebenszeit',
    source: 'Your Money or Your Life',
    ruleCode: null,
  },
  {
    code: 'S2-6',
    stage: 2,
    text: 'Versicherungen vollständig',
    source: 'Get Good with Money',
    ruleCode: null,
  },
  {
    code: 'S3-1',
    stage: 3,
    text: 'Crossover Point: 4 % Kapitalertrag deckt die Ausgaben',
    source: 'Your Money or Your Life',
    ruleCode: 'R16',
  },
  {
    code: 'S3-2',
    stage: 3,
    text: 'Fondskosten im Ziel, Rebalancing im Band',
    source: 'I Will Teach You to Be Rich',
    ruleCode: 'R22',
    additionalRuleCodes: ['R13'],
  },
  {
    code: 'S3-3',
    stage: 3,
    text: 'Testament und Vorsorgevollmacht',
    source: 'Get Good with Money',
    ruleCode: null,
  },
  {
    code: 'S3-4',
    stage: 3,
    text: 'Steuern gestalten: Verlustausgleich, Freibeträge',
    source: 'Everyday Millionaires',
    ruleCode: null,
  },
];
