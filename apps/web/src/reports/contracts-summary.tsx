import { useState } from 'react';
import { Button } from '@budget/ui';
import type { ContractsReport } from '@budget/db';
import { useAmountPrivacy } from '@budget/ui';
import { rhythmText } from '../expected/expected-model';
import { eur, nativeCurrency } from '../ledger/format';
import { AppLink } from '../shell/app-link';

const RHYTHMS = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  semiannual: 'halbjährlich',
  yearly: 'jährlich',
  weekly: 'wöchentlich',
};
export function ContractsSummary({ data }: { data: ContractsReport }) {
  useAmountPrivacy();
  const [all, setAll] = useState(false);
  if (!data.items.length) return null;
  return (
    <section className="sr-card r11-contract-summary" aria-labelledby="r11-contract-title">
      <h2 id="r11-contract-title">Laufende Verträge</h2>
      <table className="r11-table r11-contract-desktop">
        <caption className="sr-only">
          Verträge mit Originalbetrag je Zahlung, Jahresäquivalent in Euro und Anteil
        </caption>
        <thead>
          <tr>
            <th scope="col">Vertrag</th>
            <th scope="col">Rhythmus</th>
            <th scope="col">Je Zahlung</th>
            <th scope="col">Je Jahr · EUR</th>
            <th scope="col">Anteil</th>
          </tr>
        </thead>
        <tbody>
          {(all ? data.items : data.items.slice(0, 9)).map((item) => (
            <tr key={item.id}>
              <th scope="row">{item.name}</th>
              <td>
                {item.rhythm === 'weekly'
                  ? rhythmText('weekly', item.intervalWeeks)
                  : RHYTHMS[item.rhythm]}
              </td>
              <td>{nativeCurrency(item.nativeCents, item.currency)}</td>
              <td>{item.yearlyCents === null ? '— · Kurs fehlt' : eur(item.yearlyCents)}</td>
              <td>
                <span
                  className="r11-share"
                  role="img"
                  aria-label={
                    item.yearlyCents === null || data.yearlyCents <= 0
                      ? 'Kein Anteil berechenbar'
                      : `${item.name}: ${eur(item.yearlyCents)} von ${eur(data.yearlyCents)} im Jahr`
                  }
                >
                  <i
                    style={{
                      width: `${item.yearlyCents === null || data.yearlyCents <= 0 ? 0 : Math.max(0, Math.min(100, (item.yearlyCents / data.yearlyCents) * 100))}%`,
                    }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Alle {data.items.length} Verträge · Jahresäquivalent in EUR
            </th>
            <td>{eur(data.yearlyCents)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <ul className="r11-contract-phone">
        {(all ? data.items : data.items.slice(0, 6)).map((item) => (
          <li key={item.id}>
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.rhythm === 'weekly'
                  ? rhythmText('weekly', item.intervalWeeks)
                  : RHYTHMS[item.rhythm]}{' '}
                · {nativeCurrency(item.nativeCents, item.currency)}
              </small>
            </span>
            <span>
              {item.yearlyCents === null ? '— · Kurs fehlt' : eur(item.yearlyCents)}
              <small>je Jahr · EUR</small>
            </span>
          </li>
        ))}
      </ul>
      {data.items.length > 6 && (
        <Button variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Weniger Verträge anzeigen' : `Alle ${data.items.length} Verträge anzeigen`}
        </Button>
      )}
      <p className="sr-note">
        {data.items.length} Verträge · {eur(data.yearlyCents)} je Jahr.{' '}
        {data.unconvertedCount
          ? `${data.unconvertedCount} ohne EUR-Kurs fehlen in den Summen. `
          : ''}
        Bindung und Kündigungsfrist sind nicht erfasst.
      </p>
      <AppLink to="/plan/erwartet" className="r11-source-link">
        Wiederkehrende Zahlungen pflegen
      </AppLink>
    </section>
  );
}
