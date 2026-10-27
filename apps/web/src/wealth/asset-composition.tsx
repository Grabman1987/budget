import type { AssetCompositionPoint, CompositionAmount } from '@budget/domain';
import { maskMoneyText, privateAmount, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { AppLink } from '../shell/app-link';
import { eur, longDay } from '../ledger/format';
import { percentText } from './portfolio-format';

function Amount({ value }: { value: CompositionAmount }) {
  return <span className="asset-composition-amount">
    {value.valueCents === null ? <><span>{value.unavailable === 'result_limit' ? 'Wert nicht darstellbar' : 'Wert fehlt'}</span>{value.knownCents !== null && <small>Bekannt: {eur(value.knownCents)}</small>}</> : <span className="asset-composition-value">{eur(value.valueCents)}</span>}
    {value.shareBp !== null && <small>{privateAmount(percentText(value.shareBp))}</small>}
  </span>;
}

/** Contributions are producer components; account mode uses the original whole-account value. */
export function AssetComposition({ point }: { point: AssetCompositionPoint }) {
  useAmountPrivacy();
  const [mode, setMode] = useState<'groups' | 'accounts'>('groups');
  const hasShares = point.groups.some((g) => g.shareBp !== null);
  // Retain the previous account view's asset/debt ordering; unavailable values stay last.
  const accounts = [...point.accounts].sort((a, b) => {
    if (a.valueCents === null) return b.valueCents === null ? 0 : 1;
    if (b.valueCents === null) return -1;
    if ((a.valueCents < 0) !== (b.valueCents < 0)) return a.valueCents < 0 ? 1 : -1;
    return a.valueCents < 0 ? a.valueCents - b.valueCents : b.valueCents - a.valueCents;
  });
  return <section className="vcomp asset-composition" aria-labelledby="comp-title">
    <div className="tbd-head"><h2 id="comp-title">Woraus es besteht</h2></div>
    <div className="composition-switch" role="group" aria-label="Zusammensetzung anzeigen">
      <button type="button" aria-pressed={mode === 'groups'} onClick={() => setMode('groups')}>Nach Vermögensart</button>
      <button type="button" aria-pressed={mode === 'accounts'} onClick={() => setMode('accounts')}>Nach Konto</button>
    </div>
    <p className="vnote">Stand {longDay(point.asOf)}{hasShares ? ' · Anteile am Nettovermögen' : ' · Eurobeträge ohne Prozentanteile'}</p>
    {!point.complete && <p className="vnote">Werte fehlen, sind geschätzt, nicht aktuell oder nicht darstellbar. Bekannter Anteil: {point.knownCents === null ? 'nicht darstellbar' : eur(point.knownCents)}. Prozentanteile sind nicht verfügbar.</p>}
    {mode === 'groups' && point.unavailable ? <p className="vnote">Die Gruppensumme überschreitet den darstellbaren Bereich. Die einzelnen Kontowerte bleiben unter „Nach Konto“ verfügbar.</p> : mode === 'groups' ? <div className="asset-composition-groups">
      {point.groups.map((group) => <details key={group.key} className="asset-composition-group" data-asset-group={group.key}>
        <summary><span>{group.label}</span><Amount value={group} /></summary>
        {group.accounts.length === 0 ? <p className="vnote">Kein Kontobeitrag in dieser Vermögensart.</p> :
          <table><caption className="sr-only">Kontobeiträge zu {group.label}</caption>
            <thead><tr><th scope="col">Konto</th><th scope="col">Beitrag</th></tr></thead>
            <tbody>{group.accounts.map((row) => <tr key={row.accountId}>
              <th scope="row"><AppLink to={`/konten/${row.accountId}`}>{maskMoneyText(row.name)}</AppLink></th>
              <td><Amount value={row} /></td>
            </tr>)}</tbody>
          </table>}
      </details>)}
      <p className="vnote">Kontobeiträge können auf mehrere Vermögensarten verteilt sein. Depot-Bargeld enthält jedes Verrechnungskonto nur einmal; negative Werte zählen zu Schulden.</p>
    </div> : <table className="asset-composition-accounts">
      <caption className="sr-only">Ganze Kontowerte am gewählten Stichtag</caption>
      <thead><tr><th scope="col">Konto</th><th scope="col">Kontowert</th></tr></thead>
      <tbody>{accounts.map((row) => <tr key={row.accountId}>
        <th scope="row"><AppLink to={`/konten/${row.accountId}`}>{maskMoneyText(row.name)}</AppLink></th>
        <td><Amount value={row} /></td>
      </tr>)}</tbody>
    </table>}
    {point.complete && !hasShares && <p className="vnote">Prozentanteile werden ab 100 Euro Nettovermögen angezeigt.</p>}
  </section>;
}
