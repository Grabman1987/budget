import type { BankInboxRef, BankMatchExplanation } from '@budget/db';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote } from '../ledger/states';
import { INBOX_KEY } from './api';
import './bank-source-explanation.css';

/** Opening this disclosure reads current canonical projections; it never prepares or applies a write. */
export function BankSourceExplanation({ type, id, preparedRevision }: BankInboxRef & { preparedRevision?: string | undefined }) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const explanation = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-source-explanation', type, id],
    enabled: open,
    staleTime: 0,
    retry: false,
    queryFn: () => request<BankMatchExplanation>('GET', `/api/bank-sync/${type === 'candidate' ? 'candidates' : 'bookings'}/${encodeURIComponent(id)}/explanation`),
  });
  const data = explanation.data;
  const stale = data && preparedRevision && data.review.readyRevision !== preparedRevision;
  const reload = async () => {
    await qc.invalidateQueries({ queryKey: INBOX_KEY });
    await explanation.refetch();
  };
  return <details className="bank-source-explanation" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Quelle und Zuordnung erklären</summary>
    {open && <div className="bank-source-explanation-body">
      {explanation.isFetching && <p role="status">Quellenstand wird geladen …</p>}
      {explanation.isError && <ErrorNote what="Quellenstand" error={explanation.error} onRetry={() => void explanation.refetch()} />}
      {data && !explanation.isFetching && !explanation.isError && <>
        <p>{data.review.available ? maskMoneyText(data.review.reason) : 'Für diesen Umsatz sind derzeit keine bearbeitbaren Vorschläge verfügbar. Die gespeicherte Herkunft bleibt sichtbar.'}</p>
        {stale && <div role="status">
          <p>Der Quellenstand unterscheidet sich vom angezeigten Vorschlag. Vor dem Übernehmen die Vorschläge neu laden.</p>
          <Button size="sm" variant="ghost" onClick={() => void reload()}>Vorschläge neu laden</Button>
        </div>}
        <ul>
          <li>Automatischer Bankabgleich: gleiches Konto, gleiche Währung und exakt gleicher Betrag mit Vorzeichen; höchstens {data.windows.autoLinkDays} Kalendertage Abstand. Ein einzelner eindeutiger Treffer kann verknüpft werden.</li>
          <li>Manuelle Vorschläge: höchstens {data.windows.suggestionDays} Kalendertage. Die Reihenfolge nach Datumsabstand ist keine Bestätigung. Umbuchungen brauchen die bestehende ausdrückliche Auswahl und dieselbe Währung.</li>
          <li>Abrufüberlappung: {data.windows.overlapDays} Tage vor dem letzten erfolgreichen Abruf, frühestens ab dem Quellenbeginn. Das ist kein Zuordnungsfenster.</li>
        </ul>
        <p>Im bestehenden automatischen Stapelabgleich werden gleichartige Umsatzgruppen bei genau gleich vielen passenden Buchungen der Reihe nach gepaart. Beanspruchen mehrere Umsätze dieselbe einzelne Buchung, entscheidet der kleinste Datumsabstand, danach die Eingangsreihenfolge. Diese Erklärung rekonstruiert keine frühere Stapelentscheidung.</p>
        <p>„Vorschlag passt“ ist strenger: eine unterstützte eindeutige Zuordnung am selben Tag oder eine einzelne unterstützte Regel. Erst deine Bestätigung übernimmt sie; Quelle, Ziel und Revision werden dabei erneut geprüft.</p>
        {data.review.available && <>
          <p>Aktuell {data.review.targets.length} manuelle Zuordnungsmöglichkeiten · {data.review.competingCandidateIds.length} weitere offene Bankumsätze mit gleichem Konto, Tag, Betrag und Währung.</p>
          {data.review.targets.length > 1 && <p>Mehrere Möglichkeiten: einzeln prüfen und ausdrücklich entscheiden. Die Reihenfolge beweist keine Zuordnung.</p>}
          {data.review.targets.length === 0 && <p>Keine aktuell geeignete Buchung im Vorschlagsfenster. Das beweist weder eine neue Zahlung noch das Fehlen einer geschützten Buchung.</p>}
        </>}
        {data.revisionWarningIds.length > 0 && <p>Offene Quellenänderung: Die Bank hat einen bereits bearbeiteten Umsatz geändert. Die Änderung wurde nicht still in die Buchung übernommen; den vorhandenen Warnhinweis prüfen.</p>}
        <details>
          <summary>Quellenkennungen und aktuelle Revisionen</summary>
          <dl>
            <dt>Konto</dt><dd><code>{data.accountId}</code></dd>
            <dt>{type === 'candidate' ? 'Bankumsatz' : 'Buchung'}</dt><dd><code>{id}</code></dd>
            <dt>Bankquelle</dt><dd><code>{data.source?.id ?? 'Nicht eindeutig verfügbar'}</code></dd>
            <dt>Gespeicherter Bankumsatz</dt><dd><code>{data.identity.candidateId ?? 'Nicht eindeutig zuordenbar'}</code></dd>
            <dt>Gespeicherter Identitätshash</dt><dd><code>{data.identity.storedKey ?? 'Nicht verfügbar'}</code></dd>
            <dt>Aktuelle Quellenrevision</dt><dd><code>{data.review.candidateRevision ?? 'Keine offene Quellenrevision verfügbar'}</code></dd>
            <dt>Aktuelle Vorschlagsrevision</dt><dd><code>{data.review.readyRevision ?? 'Kein übernahmefähiger Vorschlag'}</code></dd>
          </dl>
          <p>Neue Quellenkennungen verwenden eine im Abruf eindeutige Bankreferenz, sonst Datum, Centbetrag, Währung, bereinigten Buchungstext und die laufende Nummer identischer Zeilen. Gespeichert wird ein Hash. Referenzart und damalige laufende Nummer lassen sich daraus nicht zurückgewinnen. Gleiche Beträge allein beweisen keine Identität; veränderte Stapel oder Reihenfolgen müssen geprüft werden.</p>
          {data.source && <p>Quellenbeginn {data.source.fromDate ?? 'nicht konfiguriert'} · letzter erfolgreicher Abruf {data.source.lastSyncAt ?? 'noch keiner'} · nächster überlappender Abruf ab {data.source.nextFetchFrom ?? 'nicht verfügbar'}.</p>}
          {data.identity.linkedBookingIds.map((bookingId) => <p key={bookingId}>Buchung mit dieser gespeicherten Quellenkennung: <code>{bookingId}</code></p>)}
          {data.revisionWarningIds.map((warningId) => <p key={warningId}>Quellenwarnung: <code>{warningId}</code></p>)}
          {data.review.targets.map((target) => <p key={`${target.action}:${target.id}`}>
            {target.action === 'merge' ? 'Zusammenführen' : target.action === 'link' ? 'Bankreferenz verknüpfen' : 'Umbuchung prüfen'}: <code>{target.id}</code> · {target.date} · {target.dayGap} Tage Abstand
          </p>)}
          {data.review.competingCandidateIds.map((candidateId) => <p key={candidateId}>Weiterer offener Bankumsatz: <code>{candidateId}</code></p>)}
          {data.review.rules.map((rule) => <p key={rule.id}>
            Aktuelle Regel {maskMoneyText(rule.name)} · <code>{rule.id}</code> · Revision <code>{rule.revision}</code> · {rule.available ? 'derzeit verfügbar' : 'derzeit nicht verfügbar'} · {rule.automatic ? 'als automatisch konfiguriert' : 'manuelle Regel'}. Dies ist kein Nachweis einer früheren Anwendung.
          </p>)}
        </details>
      </>}
    </div>}
  </details>;
}

