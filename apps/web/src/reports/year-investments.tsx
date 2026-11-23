import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { percentText, ppText } from '../pages/portfolio-report-shared';
import type { YearReportRead } from './overview-api';
import { bpText, monthLong } from './overview-format';

const NA = 'nicht ermittelbar';

/**
 * Jahresreport block "Investments, Trading, Sparquote": every figure is read from the shared
 * calculations (net worth chain, portfolio performance, Sparquote); nothing is derived here.
 */
export function YearInvestments({ data }: { data: YearReportRead }) {
  useAmountPrivacy();
  const { investments: inv, wealthColumns: wealth, savingsSplit: split, debt } = data;
  const lastMonth = data.report.months[data.report.months.length - 1];
  const perf = inv?.performance ?? null;
  const t = inv?.trading;
  const money = (cents: number) => eur(cents, { cents: false });
  const growth = (c: { deltaCents: number; changeBp: number | null }) =>
    `${money(c.deltaCents)} · ${c.changeBp === null ? NA : privateAmount(bpText(c.changeBp, { sign: true }))}`;
  const sub = (cents: number | null, bp: number | null) =>
    cents === null || bp === null ? NA : `${money(cents)} · ${privateAmount(bpText(bp))}`;
  const current = t?.results;
  const previous = t?.previousResults;
  const compareMoney = (key: 'gainsCents' | 'lossesCents') => {
    if (!current?.salesComplete) return `${NA} · Einstand oder Kurs fehlt`;
    const value = eur(current[key]);
    if (!previous) return `${value} · Vorjahr: ${NA} · kein Vergleichszeitraum`;
    if (!previous.salesComplete) return `${value} · Vorjahr: ${NA} · Einstand oder Kurs fehlt`;
    return `${value} · Vorjahr: ${eur(previous[key])} · Differenz: ${eur(current[key] - previous[key], { sign: true })}`;
  };
  const hitRate = (result: typeof current) => {
    if (!result) return `${NA} · Kurs fehlt`;
    if (result.hitRateBp === null)
      return `${NA} · ${result.closuresComplete ? 'keine geschlossenen Positionen' : 'Einstand fehlt'}`;
    return privateAmount(bpText(result.hitRateBp));
  };
  return (
    <div data-testid="yr-investments">
      {lastMonth && (
        <p className="ov-sheet-note" data-testid="yr-invest-period">
          Zeitraum: bis {monthLong(lastMonth)} (letzter voller Monat).
        </p>
      )}
      <table className="ov-table ov-sheet-table" data-testid="yr-wealth-columns">
        <caption className="sr-only">Vermögenszuwachs ohne und mit Markt</caption>
        <thead>
          <tr>
            <th className="tech">Vermögenszuwachs</th>
            <th className="tech n">Ohne Markt</th>
            <th className="tech n">Mit Markt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Veränderung</th>
            <td className="n">{wealth ? growth(wealth.withoutMarket) : NA}</td>
            <td className="n">{wealth ? growth(wealth.withMarket) : NA}</td>
          </tr>
        </tbody>
      </table>
      <table className="ov-table ov-sheet-table" data-testid="yr-savings-split">
        <caption className="sr-only">Sparquote geteilt</caption>
        <tbody>
          <tr>
            <th scope="row">Sparquote gesamt</th>
            <td className="n">{split ? sub(split.savedCents, split.totalBp) : NA}</td>
          </tr>
          <tr>
            <th scope="row">Netto-Einzahlungen ins Depot</th>
            <td className="n">{split ? sub(split.investedCents, split.investedBp) : NA}</td>
          </tr>
          <tr>
            <th scope="row">Rest (Konten)</th>
            <td className="n">{split ? sub(split.cashCents, split.cashBp) : NA}</td>
          </tr>
        </tbody>
      </table>
      <p className="ov-sheet-note">
        Für die Sparquote zählen Überweisungen zwischen Budgetkonten und Depots samt
        Verrechnungskonten zum Buchungsdatum am Budgetkonto. Der Rest ist Gespartes minus
        Netto-Einzahlungen. Ein negativer Rest heißt: mehr eingezahlt als gespart.
      </p>
      {inv === null || perf === null ? (
        <p className="ov-sheet-note" role="status">
          Investments: {data.investmentsUnavailable ?? 'keine Depotdaten in diesem Zeitraum'} ({NA}
          ).
        </p>
      ) : (
        <table className="ov-table ov-sheet-table" data-testid="yr-invest-figures">
          <caption className="sr-only">Investments und Trading</caption>
          <tbody>
            <tr>
              <th scope="row">Wert Anfang → Ende</th>
              <td className="n">
                {money(perf.startValueCents)} → {money(perf.endValueCents)}
              </td>
            </tr>
            <tr>
              <th scope="row">Netto-Einzahlungen</th>
              <td className="n">{money(perf.contributionsCents)}</td>
            </tr>
            <tr>
              <th scope="row">Marktergebnis (Wertpapiere)</th>
              <td className="n">{money(perf.gainCents)}</td>
            </tr>
            <tr>
              <th scope="row">Rendite (TTWROR)</th>
              <td className="n">{percentText(perf.ttwror, { sign: true })}</td>
            </tr>
            <tr>
              <th scope="row">Rendite (XIRR p. a.)</th>
              <td className="n">
                {perf.xirr === null
                  ? `${NA} · keine berechenbare Zahlungsreihe im Zeitraum`
                  : privateAmount(percentText(perf.xirr, { sign: true }))}
              </td>
            </tr>
            <tr>
              <th scope="row">
                {inv.benchmark ? `Vergleich: ${inv.benchmark.name} (TTWROR)` : 'Vergleichswert'}
              </th>
              <td className="n">
                {inv.benchmark ? percentText(inv.benchmark.ttwror, { sign: true }) : NA}
              </td>
            </tr>
            <tr>
              <th scope="row">Depot-Erträge laut Abrechnungen (brutto)</th>
              <td className="n" data-testid="yr-depot-income">
                {money(inv.income.grossCents)} · Steuer {money(inv.income.taxCents)} · Gebühr{' '}
                {money(inv.income.feeCents)} · netto {money(inv.income.netCents)}
              </td>
            </tr>
            {t && (
              <>
                <tr>
                  <th scope="row">Käufe / Verkäufe</th>
                  <td className="n">
                    {t.buys} / {t.sells}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Davon Sparplan-Käufe</th>
                  <td className="n">
                    {t.savingsPlanBuys} von {t.buys}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Realisierter Gewinn/Verlust</th>
                  <td className="n">
                    {t.realizedGainCents === null
                      ? NA
                      : `${money(t.realizedGainCents)}${t.realizedGainComplete ? '' : ' (unvollständig)'}`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Realisierte Gewinne</th>
                  <td className="n">{compareMoney('gainsCents')}</td>
                </tr>
                <tr>
                  <th scope="row">Realisierte Verluste</th>
                  <td className="n">{compareMoney('lossesCents')}</td>
                </tr>
                <tr>
                  <th scope="row">Trefferquote geschlossener Positionen</th>
                  <td className="n">
                    {hitRate(current)} · Vorjahr:{' '}
                    {previous ? hitRate(previous) : `${NA} · kein Vergleichszeitraum`}
                    {current?.hitRateBp != null &&
                      previous?.hitRateBp != null &&
                      ` · Differenz: ${privateAmount(ppText((current.hitRateBp - previous.hitRateBp) / 10000))}`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Gebühren / Steuern</th>
                  <td className="n">
                    {money(t.feesCents)} / {money(t.taxesCents)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      <p className="ov-sheet-note">
        Depot-Erträge können vom gebuchten Kapitalertrag abweichen (Buchungsdatum, Zinsen auf
        Konten). Werte wie im Portfolio-Report für denselben Zeitraum. Die Trefferquote zählt
        Positionen, die durch einen Verkauf vollständig geschlossen wurden.
      </p>
      <table className="ov-table ov-sheet-table" data-testid="yr-debt-income">
        <caption className="sr-only">Schulden und Einkommensquellen</caption>
        <tbody>
          <tr>
            <th scope="row">Restschuld Anfang → Ende</th>
            <td className="n">
              {debt && debt.startCents !== null && debt.endCents !== null
                ? `${money(debt.startCents)} → ${money(debt.endCents)}`
                : NA}
            </td>
          </tr>
          {data.report.incomeBySource.map((i) => (
            <tr key={i.typeId}>
              <th scope="row">Einkommen: {i.name}</th>
              <td className="n">{money(i.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ov-sheet-note">
        Nicht enthalten: Realwerte (nach Inflation), Zinszahlungen, Sparziele und Rücklage; dafür
        liegt noch keine gemeinsame Berechnung vor.
      </p>
    </div>
  );
}
