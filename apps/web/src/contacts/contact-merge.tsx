import { Button, Field, FormDialog, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { eur } from '../ledger/format';
import { lookupsQuery } from '../ledger/queries';
import { useContactWrite } from './contacts-page';

/** Machine-readable merge refusals of the server, in the words of the dialog. */
export const MERGE_CONFLICT_TEXT: Record<string, string> = {
  same_contact: 'Wähle einen anderen Kontakt als Ziel.',
  source_merged: 'Dieser Kontakt wurde bereits mit einem anderen zusammengeführt.',
  target_merged: 'Der Zielkontakt wurde bereits mit einem anderen zusammengeführt.',
  source_archived: 'Dieser Kontakt ist archiviert. Bitte zuerst wieder öffnen.',
  target_archived: 'Der Zielkontakt ist archiviert. Bitte zuerst wieder öffnen.',
  source_has_sources:
    'In diesen Kontakt wurden schon andere Kontakte zusammengeführt. Wähle ihn als Ziel, nicht als Quelle.',
  both_receivable_account:
    'Beide Kontakte haben ein Forderungskonto. Bitte zuerst eines davon auflösen.',
  label_taken: 'Der Name dieses Kontakts wird bereits als Name oder Alias verwendet.',
  would_net:
    'Ein Guthaben würde dabei mit offenen Auslagen des anderen Kontakts verrechnet. Das passiert nie automatisch; bitte zuerst das Guthaben einlösen.',
  statement_invalid: 'Die Salden beider Kontakte lassen sich nicht sicher zusammenführen.',
};

interface MergePreview {
  token: string | null;
  source: { id: string; name: string; receivableCents: number; creditCents: number };
  target: { id: string; name: string; receivableCents: number; creditCents: number };
  after: { receivableCents: number; creditCents: number };
  stays: {
    bookingSplits: number;
    settlements: number;
    allocations: number;
    payslips: number;
    reconciledBookings: number;
  };
  moves: { payees: number; expectedPayments: number; accounts: number };
  newAlias: string;
  conflicts: string[];
}

const contactPath = (id: string) => `/api/contacts/${encodeURIComponent(id)}`;

/** Merge a contact into another one: explicit preview first, one confirm, Undo toast afterwards. */
export function ContactMergeDialog({
  source,
  onClose,
}: {
  source: { id: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={source !== null} onClose={onClose} title="Kontakte zusammenführen">
      {source && <MergeForm source={source} onClose={onClose} />}
    </FormDialog>
  );
}

function MergeForm({ source, onClose }: { source: { id: string; name: string }; onClose: () => void }) {
  const lookups = useQuery(lookupsQuery());
  const write = useContactWrite();
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const candidates = (lookups.data?.contacts ?? []).filter(
    (c) => c.id !== source.id && !c.archived,
  );
  const target = candidates.find((c) => c.id === targetId);
  const lines = (p: MergePreview) => {
    const parts = [
      `${p.stays.bookingSplits} Buchungsanteile, ${p.stays.settlements} Ausgleiche und ${p.stays.allocations} Zuordnungen bleiben unverändert beim alten Kontakt und werden dem Ziel zugerechnet.`,
    ];
    if (p.stays.reconciledBookings > 0)
      parts.push(
        `${p.stays.reconciledBookings} geprüfte Buchungen bleiben gesperrt und unverändert.`,
      );
    const moved = [
      p.moves.payees && `${p.moves.payees} Zahlungsempfänger`,
      p.moves.expectedPayments && `${p.moves.expectedPayments} erwartete Zahlungen`,
      p.moves.accounts && `${p.moves.accounts} Forderungskonto`,
    ].filter(Boolean);
    if (moved.length) parts.push(`Künftig verknüpft mit dem Ziel: ${moved.join(', ')}.`);
    parts.push(`„${p.newAlias}“ wird ein Alias des Ziels.`);
    return parts;
  };
  const showPreview = async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setPreview(
        await request<MergePreview>('POST', `${contactPath(source.id)}/merge/preview`, {
          targetId,
        }),
      );
    } catch (error) {
      setPreview(null);
      setProblem('Die Vorschau ist gerade nicht möglich. Bitte versuche es noch einmal.');
      if (!(error instanceof ApiError)) throw error;
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="bkform"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !preview?.token || preview.conflicts.length) return;
        const token = preview.token;
        setBusy(true);
        setProblem(null);
        void write(
          () =>
            request<{ groupId: string }>('POST', `${contactPath(source.id)}/merge`, {
              targetId,
              token,
            }).catch((error: unknown) => {
              if (error instanceof ApiError && error.code === 'stale_preview') {
                setPreview(null);
                setProblem('Die Daten haben sich geändert. Bitte die Vorschau neu anzeigen.');
              }
              throw error;
            }),
          'Kontakte zusammengeführt.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onClose();
        });
      }}
    >
      <div className="bk-head">
        <h2 className="bk-kind-fixed">„{source.name}“ zusammenführen</h2>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ×
          <span className="control-label" aria-hidden="true">
            Schließen
          </span>
        </button>
      </div>
      <div className="bk-body contacts-form">
        <p>
          Der Verlauf von „{source.name}“ wird dem Ziel zugerechnet. Nichts wird gelöscht, keine
          Buchung ändert sich, und Beträge werden nie gegeneinander verrechnet. Du kannst die
          Zusammenführung danach rückgängig machen.
        </p>
        <Field label="Zusammenführen mit">
          {({ id }) => (
            <Select
              id={id}
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setPreview(null);
                setProblem(null);
              }}
            >
              <option value="">Kontakt wählen</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        {preview && (
          <div role="region" aria-label="Vorschau der Zusammenführung" className="kstate">
            <p>
              <strong>
                „{preview.source.name}“ geht in „{preview.target.name}“ auf.
              </strong>
            </p>
            <ul>
              <li>
                Offene Auslagen danach: {eur(preview.after.receivableCents)} (vorher{' '}
                {eur(preview.source.receivableCents)} und {eur(preview.target.receivableCents)}).
              </li>
              <li>
                Guthaben danach: {eur(preview.after.creditCents)} (vorher{' '}
                {eur(preview.source.creditCents)} und {eur(preview.target.creditCents)}).
              </li>
              {lines(preview).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {preview.conflicts.length > 0 && (
              <div role="alert">
                <p>
                  <strong>Zusammenführen geht so nicht:</strong>
                </p>
                <ul>
                  {preview.conflicts.map((reason) => (
                    <li key={reason}>{MERGE_CONFLICT_TEXT[reason] ?? 'Das geht gerade nicht.'}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {target && !preview && (
          <p className="tech">Zuerst die Vorschau prüfen, dann bestätigen.</p>
        )}
      </div>
      <div className="bk-foot">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="ghost" disabled={!targetId || busy} onClick={() => void showPreview()}>
          Vorschau anzeigen
        </Button>
        <Button type="submit" disabled={busy || !preview?.token || preview.conflicts.length > 0}>
          Zusammenführen bestätigen
        </Button>
      </div>
    </form>
  );
}
