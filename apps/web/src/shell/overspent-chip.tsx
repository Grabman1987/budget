import { overspentEnvelopes, todayInVienna } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { budgetQuery } from '../budget/budget-api';
import { planRows } from '../budget/plan-model';
import { eur } from '../ledger/format';
import { AppLink } from './app-link';

/** Global status link to this month's existing triage and cover/undo actions. */
export function OverspentChip({ compact = false }: { compact?: boolean }) {
  useAmountPrivacy();
  const month = todayInVienna().slice(0, 7);
  const query = useQuery(budgetQuery(month));
  const search = { monat: month, ansicht: 'triage' };

  if (query.isError) {
    return (
      <div className="overspent-chip">
        <AppLink
          className={
            compact
              ? 'overspent-chip-btn overspent-chip-btn-compact overspent-chip-btn-unknown'
              : 'overspent-chip-btn overspent-chip-btn-unknown'
          }
          to="/plan/monat"
          search={search}
          aria-label="Budgetstatus nicht verfügbar – Plan prüfen"
        >
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
          {!compact && <span>Budgetstatus nicht verfügbar – Plan prüfen</span>}
        </AppLink>
      </div>
    );
  }
  if (!query.data) return null;

  const rows = planRows(query.data);
  const over = overspentEnvelopes({ envelopes: rows });
  if (over.length === 0) return null;

  let total = 0;
  let totalKnown = true;
  for (const row of over) {
    const cents = row.overspentCents;
    if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isSafeInteger(total + cents)) {
      totalKnown = false;
      break;
    }
    total += cents;
  }

  const noun = over.length === 1 ? 'Envelope' : 'Envelopes';
  const amount = totalKnown ? `${eur(total)} zu decken` : 'Betrag unbekannt';
  const label = `${over.length} ${noun} überzogen, ${amount} – Überziehungen prüfen`;

  return (
    <div className="overspent-chip">
      <AppLink
        className={compact ? 'overspent-chip-btn overspent-chip-btn-compact' : 'overspent-chip-btn'}
        to="/plan/monat"
        search={search}
        aria-label={label}
      >
        <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="overspent-chip-count" aria-hidden="true">
          {over.length}
        </span>
        {!compact && (
          <span className="overspent-chip-detail" aria-hidden="true">
            {` überzogen · ${totalKnown ? eur(total) : 'Betrag unbekannt'}`}
          </span>
        )}
      </AppLink>
    </div>
  );
}
