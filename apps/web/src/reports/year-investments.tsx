import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { percentText } from '../pages/portfolio-report-shared';
import type { YearReportRead } from './overview-api';
import { bpText } from './overview-format';

const NA = 'nicht ermittelbar';

/**
 * Jahresreport block "Investments, Trading, Sparquote": every figure is read from the shared
 * calculations (net worth chain, portfolio performance, Sparquote); nothing is derived here.
 */
export function YearInvestments({ data }: { data: YearReportRead }) {
  useAmountPrivacy();
  const { investments: inv, wealthColumns: wealth, savingsSplit: split } = data;
  const perf = inv?.performance ?? null;
  const t = inv?.trading;
  const money = (cents: number) => eur(cents, { cents: false });
  const growth = (c: { deltaCents: number; changeBp: number | null }) =>
    `${money(c.deltaCents)} · ${c.changeBp === null ? NA : privateAmount(bpText(c.changeBp, { sign: true }))}`;
  return (
    <div data-testid="yr-investments">
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
            <td className="n">
              {split ? `${money(split.savedCents)} · ${bpText(split.totalBp)}` : NA}
            </td>
          </tr>
          <tr>
            <th scope="row">davon in Investments</th>
            <td className="n">
              {split ? `${money(split.investedCents)} · ${bpText(split.investedBp)}` : NA}
            </td>
          </tr>
          <tr>
            <th scope="row">davon auf Kontos (Bargeld)</th>
            <td className="n">
              {split ? `${money(split.cashCents)} · ${bpText(split.cashBp)}` : NA}
            </td>
          </tr>
        </tbody>
      </table>
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
              <th scope="row">Marktergebnis</th>
              <td className="n">{money(perf.gainCents)}</td>
            </tr>
            <tr>
              <th scope="row">Rendite (TTWROR)</th>
              <td className="n">{percentText(perf.ttwror, { sign: true })}</td>
            </tr>
            <tr>
              <th scope="row">Rendite (kapitalgewichtet, Dietz)</th>
              <td className="n">{percentText(perf.moneyWeighted, { sign: true })}</td>
            </tr>
            <tr>
              <th scope="row">Erträge (Dividenden, Zinsen), brutto</th>
              <td className="n">{money(inv.income.grossCents)}</td>
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
        Werte wie im Portfolio-Report für denselben Zeitraum. Trefferquote geschlossener Positionen
        fehlt, weil kein Gewinn je Position vorliegt.
      </p>
    </div>
  );
}
