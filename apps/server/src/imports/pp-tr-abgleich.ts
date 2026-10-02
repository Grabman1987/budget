import {
  accountBalances,
  account,
  booking,
  payee,
  security,
  SYSTEM_PAYEE_IDS,
  trade,
  type Executor,
} from '@budget/db';
import { settlementCents } from '@budget/domain';
import {
  checkUnits,
  compareCash,
  isCashKind,
  isInvestmentKind,
  parsePytrCsv,
  parseTradeRepublicWeb,
  summarizeTr,
  type FlowItem,
  type TrRow,
} from '@budget/import-pp';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Trade Republic reconciliation report (`tr-abgleich.md`, private): the web app's transaction list
 * and the pytr export against the ledger. It changes nothing: what would touch a budget category
 * is proposed, never applied. Aggregates and row lists for the owner's review.
 */

export interface TrAbgleichOptions {
  web: string;
  pytr?: string;
  /** The on-budget giro the platform's cash lives on, and the securities account. */
  cashbackName: string;
  depotName: string;
  /** The platform's real cash on the closing day (what the app shows), in cents. */
  realCashCents: number;
  today: string;
}

const eur = (c: number) =>
  `${c < 0 ? '−' : ''}${(Math.abs(c) / 100).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');

export function trAbgleich(
  db: Executor,
  options: TrAbgleichOptions,
): { markdown: string; summary: Record<string, unknown> } {
  const rows = parseTradeRepublicWeb(options.web);
  const pytr = options.pytr ? parsePytrCsv(options.pytr) : [];
  const first = rows[0]?.day ?? options.today;
  const last = rows.at(-1)?.day ?? options.today;
  const accountOf = (name: string) => {
    const a = db
      .select({ id: account.id, openingDate: account.openingDate })
      .from(account)
      .where(and(eq(account.name, name), isNull(account.deletedAt)))
      .get();
    if (!a) throw new Error(`Account "${name}" not found`);
    return a;
  };
  const cashback = accountOf(options.cashbackName);
  const depot = accountOf(options.depotName);
  const balances = new Map(accountBalances(db, last).map((b) => [b.accountId, b.balanceCents]));

  // ---- the ledger side
  const names = new Map(
    db
      .select({ id: account.id, name: account.name })
      .from(account)
      .all()
      .map((a) => [a.id, a.name]),
  );
  const payees = new Map(
    db
      .select({ id: payee.id, name: payee.name })
      .from(payee)
      .all()
      .map((p) => [p.id, p.name]),
  );
  const cbRows = db
    .select()
    .from(booking)
    .where(and(eq(booking.accountId, cashback.id), isNull(booking.deletedAt)))
    .all()
    .filter((b) => b.date >= first && b.date <= last);
  const partner = new Map<string, string>();
  for (const b of cbRows)
    if (b.transferId) {
      const other = db
        .select({ accountId: booking.accountId })
        .from(booking)
        .where(and(eq(booking.transferId, b.transferId), isNull(booking.deletedAt)))
        .all()
        .find((x) => x.accountId !== cashback.id);
      if (other) partner.set(b.id, other.accountId);
    }
  const adjustmentPayees: string[] = [
    SYSTEM_PAYEE_IDS.reconciliation_adjustment.id,
    SYSTEM_PAYEE_IDS.manual_adjustment.id,
    SYSTEM_PAYEE_IDS.opening_balance.id,
  ];
  const isAdjustment = (b: (typeof cbRows)[number]) =>
    b.payeeId !== null && adjustmentPayees.includes(b.payeeId);
  const ynabAdjustments = cbRows.filter(isAdjustment);
  const ynabInvestment = cbRows.filter((b) => partner.get(b.id) === depot.id);
  const ynabCash = cbRows.filter((b) => !isAdjustment(b) && partner.get(b.id) !== depot.id);
  const item = (b: (typeof cbRows)[number]): FlowItem => ({
    date: b.date,
    cents: b.amountCents,
    ref: b.id,
  });
  const byId = new Map(cbRows.map((b) => [b.id, b]));

  // ---- A: payments, deposits, transfers, interest
  const cashRows = rows.filter((r) => isCashKind(r.kind) && r.cents !== 0);
  const cashCmp = compareCash(
    cashRows.map((r, i): FlowItem => ({ date: r.day, cents: r.cents, ref: String(i) })),
    ynabCash.map(item),
  );
  const cr = cashCmp.result;
  const stmtOnly = cr.ppOnly.map((f) => cashRows[Number(f.ref)] as TrRow);
  const ynabOnly = cr.appOnly.map((f) => byId.get(f.ref as string)!);
  const sum = (xs: { cents: number }[]) => xs.reduce((a, x) => a + x.cents, 0);

  // ---- B: investment rows against PP's trades on the depot and YNAB's transfers
  const invRows = rows.filter((r) => isInvestmentKind(r.kind));
  const isin = new Map(
    db
      .select({ id: security.id, isin: security.isin })
      .from(security)
      .all()
      .map((s) => [s.id, s.isin]),
  );
  const ppTrades = db
    .select()
    .from(trade)
    .where(and(eq(trade.accountId, depot.id), isNull(trade.deletedAt)))
    .all()
    .filter((t) => t.date >= first && t.date <= last);
  const ppItems = ppTrades
    .map((t) => ({ t, net: settlementCents(t) }))
    .filter((x) => x.net !== 0)
    .map((x): FlowItem => ({ date: x.t.date, cents: x.net, ref: x.t.id }));
  const invCmp = compareCash(
    invRows.map((r, i): FlowItem => ({ date: r.day, cents: r.cents, ref: String(i) })),
    ppItems,
  );
  const ir = invCmp.result;
  const invStmtOnly = ir.ppOnly.map((f) => invRows[Number(f.ref)] as TrRow);
  const ppOnly = ir.appOnly.map((f) => ppTrades.find((t) => t.id === f.ref)!);

  // Monthly net of the investment rows against YNAB's transfers to the depot (sign: cash account).
  const months = new Map<string, { stmt: number; ynab: number }>();
  for (const r of invRows) {
    const e = months.get(r.day.slice(0, 7)) ?? { stmt: 0, ynab: 0 };
    e.stmt += r.cents;
    months.set(r.day.slice(0, 7), e);
  }
  for (const b of ynabInvestment) {
    const e = months.get(b.date.slice(0, 7)) ?? { stmt: 0, ynab: 0 };
    e.ynab += b.amountCents;
    months.set(b.date.slice(0, 7), e);
  }

  // ---- C: units, fees (pytr) against PP
  const units = checkUnits(
    pytr,
    ppTrades
      .filter((t) => t.kind === 'buy' || t.kind === 'sell')
      .map((t) => ({ day: t.date, isin: isin.get(t.securityId) ?? null, unitsE8: t.unitsE8 })),
    pytr.at(-1)?.day ?? '0000-00-00',
  );

  // ---- cash
  const summary = summarizeTr(rows);
  const cashbackBalance = balances.get(cashback.id) ?? 0;
  const depotBalance = balances.get(depot.id) ?? 0;
  const saveback = rows.filter((r) => r.kind === 'saveback');

  const md: string[] = [];
  md.push(`# Trade Republic: Abgleich (Stand ${last})`);
  md.push(
    `Quellen: Transaktionsliste der Web-App (${rows.length} Zeilen, ${first} bis ${last})` +
      (pytr.length ? `, pytr-Export (${pytr.length} Zeilen bis ${pytr.at(-1)?.day})` : '') +
      '. Dieser Bericht ändert nichts. Alles, was eine Budgetkategorie berührt, ist nur ein Vorschlag.',
  );
  md.push('## 1. Kassenstand');
  md.push(
    table(
      ['Größe', 'Betrag in EUR'],
      [
        [
          'Echter Barbestand laut Plattform (verfügbar plus vorgemerktes Round-up)',
          eur(options.realCashCents),
        ],
        [
          'Summe der ausgeführten Zeilen der Liste (ohne Abgelehnt, Abgebrochen, Kartenprüfung, Saveback, offene Limit-Order)',
          eur(summary.cashCents),
        ],
        ['Differenz Liste minus echt', eur(summary.cashCents - options.realCashCents)],
        [`YNAB „${options.cashbackName}“ am ${last}`, eur(cashbackBalance)],
        ['Differenz YNAB minus Liste', eur(cashbackBalance - summary.cashCents)],
        [
          'Differenz YNAB minus echt (nötige Korrektur auf dem Budgetkonto)',
          eur(cashbackBalance - options.realCashCents),
        ],
        [`App „${options.depotName}“ (Barbestand im Depot)`, eur(depotBalance)],
      ],
    ),
  );
  md.push(
    'Die Liste ist die Quelle für den Kassenstand: Karte, Einzahlungen, Überweisungen, Zinsen und alle Wertpapieraufträge. Ein Rest zwischen Liste und echtem Barbestand kommt aus Vormerkungen des Tages (die Liste zeigt sie, der Barbestand noch nicht oder umgekehrt) und lässt sich aus der Liste allein nicht belegen.',
  );
  md.push(
    table(
      ['Art', 'Zeilen', 'Summe EUR'],
      Object.entries(summary.byKind).map(([k, e]) => [k, e.count, eur(e.cents)]),
    ),
  );

  md.push('## 2. Karte, Einzahlungen, Überweisungen, Zinsen gegen YNAB-Cashback-Konto');
  md.push(
    `Zeilen der Liste: ${cashRows.length}; YNAB-Zeilen ohne Depot-Umbuchungen und ohne Korrekturen: ${ynabCash.length}. Gleicher Betrag innerhalb von 3 Tagen: ${cr.exact}, anderer Tag (bis 7): ${cr.dateShifted.length}, eine Zeile = mehrere Zeilen: ${cr.split.length}. Nur in der Liste: ${stmtOnly.length} (${eur(sum(stmtOnly))}). Nur in YNAB: ${ynabOnly.length} (${eur(sum(ynabOnly.map((b) => ({ cents: b.amountCents }))))}).`,
  );
  md.push(
    `YNAB-Korrekturbuchungen („Korrektur Kontoprüfung“, Eröffnungssaldo) auf dem Konto: ${ynabAdjustments.length} Stück, Summe ${eur(sum(ynabAdjustments.map((b) => ({ cents: b.amountCents }))))}. Sie gleichen YNABs Stand an den echten an und decken fehlende Zeilen zu.`,
  );
  md.push(
    '### 2a. Nur in der Liste (YNAB fehlt die Zeile). Budgetwirkung: ändert Kategorien beziehungsweise „Zu verteilen“. Vorschlag: nachtragen nach Freigabe.',
  );
  md.push(
    table(
      ['Tag', 'Art', 'Name', 'Betrag EUR'],
      stmtOnly.map((r) => [r.day, r.kind, r.name, eur(r.cents)]),
    ),
  );
  md.push(
    '### 2b. Nur in YNAB (Zeile ohne Gegenstück in der Liste). Vorschlag: prüfen, ob doppelt oder anderes Konto.',
  );
  md.push(
    table(
      ['Tag', 'Betrag EUR', 'Empfänger', 'Konto der Gegenseite'],
      ynabOnly.map((b) => [
        b.date,
        eur(b.amountCents),
        b.payeeId ? (payees.get(b.payeeId) ?? '') : '',
        partner.get(b.id) ? (names.get(partner.get(b.id) as string) ?? '') : '',
      ]),
    ),
  );

  md.push('## 3. Wertpapieraufträge');
  md.push(
    `Zeilen (Sparplan, Round up, Kauf, Verkauf): ${invRows.length}; Trades der App im Depot im Zeitraum: ${ppTrades.length}. Gleicher Betrag innerhalb von 3 Tagen: ${ir.exact}, anderer Tag: ${ir.dateShifted.length}, Teilausführungen (mehrere Trades = eine Zeile oder umgekehrt): ${ir.split.length}. Nur in der Liste: ${invStmtOnly.length} (${eur(sum(invStmtOnly))}), nur in der App (PP): ${ppOnly.length}.`,
  );
  md.push(
    '### 3a. Nur in der Liste: Aufträge, die PP nicht hat (Einheiten nur bei Aufträgen bis zum pytr-Export bekannt). Vorschlag: nachtragen, sobald Einheiten vorliegen.',
  );
  md.push(
    table(
      ['Tag', 'Art', 'Wertpapier', 'Cash EUR'],
      invStmtOnly.map((r) => [r.day, r.kind, r.name, eur(r.cents)]),
    ),
  );
  md.push('### 3b. Nur in PP (kein Gegenstück in der Liste).');
  md.push(
    table(
      ['Tag', 'Art', 'Wertpapier (ISIN)', 'Einheiten'],
      ppOnly.map((t) => [
        t.date,
        t.kind,
        isin.get(t.securityId) ?? '',
        (t.unitsE8 / 1e8).toFixed(4),
      ]),
    ),
  );
  md.push('### 3c. Umbuchungen Cashback-Konto zu Depot in YNAB gegen die Aufträge je Monat');
  md.push(
    'Die YNAB-Umbuchungen tragen eine Budgetkategorie auf dem Cashback-Konto (ETF & Aktien). Sie fassen Aufträge zusammen und stimmen deshalb nicht Zeile für Zeile. Eine Änderung verschiebt Kategorienaktivität und braucht Freigabe.',
  );
  md.push(
    table(
      ['Monat', 'Aufträge laut Liste (Cash)', 'YNAB-Umbuchungen', 'Differenz'],
      [...months]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, e]) => [m, eur(e.stmt), eur(e.ynab), eur(e.ynab - e.stmt)]),
    ),
  );

  md.push('## 4. Einheiten (pytr gegen PP)');
  if (pytr.length === 0) md.push('Kein pytr-Export angegeben.');
  else {
    md.push(
      `Käufe und Verkäufe im Export: ${units.trades}. Positionen (je ISIN) mit gleichen Einheiten am Ende des Exports (${pytr.at(-1)?.day}): ${units.positionsEqual}. ISINs ohne Trade in PP: ${units.missingInPp.length}. Monatsenden mit anderen Einheiten: ${units.differing.length}. Eine in PP geteilt gebuchte Ausführung gilt als gleich (die Einheiten werden je ISIN aufsummiert); Ausführungen zum Monatswechsel können einen Monatsendwert kurz abweichen lassen.`,
    );
    md.push(
      table(
        ['Monatsende', 'ISIN', 'Einheiten pytr', 'Einheiten PP'],
        units.differing.map((d) => [
          d.month,
          d.isin,
          (d.pytrUnitsE8 / 1e8).toFixed(4),
          (d.ppUnitsE8 / 1e8).toFixed(4),
        ]),
      ),
    );
  }

  md.push('## 5. Saveback');
  md.push(
    `${saveback.length} Zeilen, Wert ${eur(sum(saveback))} (TR zahlt sie, kein Cash-Abgang; die Liste zeigt sie mit Minus wie einen Kauf). Sie sind im Kassenstand oben nicht enthalten. PP bildet sie als Einlage plus Kauf gleichen Betrags ab (Netto-Cash 0), der pytr-Export ebenso (Typ Einlage und Kauf). In der Depotseite zählt die Einlage in PP als Zufluss.`,
  );
  const stmtInvest = [...months.values()].reduce((a, e) => a + e.stmt, 0);
  const ynabInvest = [...months.values()].reduce((a, e) => a + e.ynab, 0);
  md.push('## 6. So kommt die App auf den echten Kassenstand');
  md.push(
    [
      `- Das Cashback-Konto bleibt, wie YNAB es führt: ${eur(cashbackBalance)} EUR (Budgetkonto, nicht angefasst).`,
      `- Auf dem Depot liegt Cash nur als Differenz: PP-Trades gegen YNABs Umbuchungen vom Cashback-Konto. Aufträge laut Liste netto ${eur(stmtInvest)} EUR gegen YNAB-Umbuchungen ${eur(ynabInvest)} EUR: ${eur(ynabInvest - stmtInvest)} EUR, die YNAB für das Depot nicht oder anders gebucht hat.`,
      `- Die Migration gleicht das Depot auf ${eur(options.realCashCents - cashbackBalance)} EUR ab (echter Barbestand minus Cashback-Konto), damit Cashback-Konto plus Depot zusammen ${eur(options.realCashCents)} EUR ergeben, ohne das Budget zu berühren. Die Abgleichsbuchung ist eine reine Depot-Buchung (keine Kategorie).`,
      '- Verbleibender Rest ist nur im Budgetkonto zu beheben (Abschnitt 2 und 6).',
    ].join(String.fromCharCode(10)),
  );
  md.push('## 7. Vorschläge');
  md.push(
    [
      `- **Kassenstand:** Das Cashback-Konto liegt ${eur(cashbackBalance - options.realCashCents)} EUR über dem echten Barbestand. Eine Korrekturbuchung dort berührt „Zu verteilen“ und braucht Freigabe; die Migration bucht sie nicht.`,
      '- **2a nachtragen** (Karte, Einzahlungen, Überweisungen, Zinsen): ändert Kategorien. Nach Freigabe in YNAB nachtragen oder per Import.',
      '- **2b prüfen:** Zeilen nur in YNAB sind Doppel, anderes Konto oder vor der Liste.',
      '- **3a nachtragen:** Aufträge nach dem letzten PP-Stand (Einheiten fehlen) und Teilausführungen.',
      '- **3c** ist reine Budgetbuchung des Owners; nicht automatisch ändern.',
    ].join('\n'),
  );
  return {
    markdown: md.join('\n\n') + '\n',
    summary: {
      listCashCents: summary.cashCents,
      realCashCents: options.realCashCents,
      cashbackBalanceCents: cashbackBalance,
      depotBalanceCents: depotBalance,
      cash: {
        exact: cr.exact,
        dateShifted: cr.dateShifted.length,
        split: cr.split.length,
        statementOnly: stmtOnly.length,
        ynabOnly: ynabOnly.length,
      },
      investment: {
        exact: ir.exact,
        dateShifted: ir.dateShifted.length,
        split: ir.split.length,
        statementOnly: invStmtOnly.length,
        ppOnly: ppOnly.length,
      },
      units: {
        trades: units.trades,
        positionsEqual: units.positionsEqual,
        differingMonthEnds: units.differing.length,
        missingInPp: units.missingInPp.length,
      },
    },
  };
}
