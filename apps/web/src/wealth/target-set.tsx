import type { TargetSetView } from '@budget/db';
import { eurWhole } from '../ledger/format';
import { AppLink } from '../shell/app-link';

/**
 * One line that says which Soll-Allocation is active: the tier chosen by the investment sum
 * (dynamic target weights, Einstellungen › Anlageklassen) or the dated versions. Nothing when no
 * Soll exists at all.
 */
export function targetSetText(set: TargetSetView): string | null {
  if (set.source === 'tiers' && set.tierLabel && set.investmentSumCents !== null)
    return `Aktives Zielset: ${set.tierLabel} (Stufe ${set.position} von ${set.count}) bei einer Anlagesumme von ${eurWhole(set.investmentSumCents)}.`;
  if (set.sumUnavailable)
    return 'Zielsets nach Anlagesumme sind angelegt, doch die Anlagesumme ist nicht berechenbar (Kurs oder Wechselkurs fehlt). Es gelten die datierten Sollquoten.';
  return null;
}

export function TargetSetNote({ set }: { set: TargetSetView }) {
  const text = targetSetText(set);
  if (!text) return null;
  return (
    <p className="vnote target-set-note" data-testid="target-set" role="status">
      {text}{' '}
      <AppLink to="/einstellungen/anlageklassen">Zielsets in Einstellungen › Anlageklassen</AppLink>
    </p>
  );
}
