import { Button, Field, FormDialog, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { lookupsQuery } from '../ledger/queries';
import { useContactWrite } from './contacts-page';

/** What keeps a contact from being archived, in the words of the settings dialog. */
export function blockerText(blocker: { kind: string; count: number }): string {
  const rows = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  switch (blocker.kind) {
    case 'receivable':
      return 'Es gibt noch offene Auslagen.';
    case 'credit':
      return 'Es gibt noch ein Guthaben.';
    case 'expected':
      return `${rows(blocker.count, 'erwartete Zahlung ist', 'erwartete Zahlungen sind')} noch mit dem Kontakt verknüpft.`;
    case 'payee':
      return `${rows(blocker.count, 'Zahlungsempfänger ist', 'Zahlungsempfänger sind')} noch mit dem Kontakt verknüpft.`;
    case 'account':
      return 'Ein Forderungskonto ist noch mit dem Kontakt verknüpft.';
    case 'payslip':
      return `${rows(blocker.count, 'Gehaltszettel ist', 'Gehaltszettel sind')} noch mit dem Kontakt als Arbeitgeber verknüpft.`;
    default:
      return 'Es ist noch etwas verknüpft.';
  }
}

const contactPath = (id: string) => `/api/contacts/${encodeURIComponent(id)}`;

export interface IdentityContact {
  id: string;
  name: string;
  updatedAt?: string | undefined;
  archived?: boolean | undefined;
  mergedIntoId?: string | null | undefined;
  aliases?: { id: string; alias: string; updatedAt: string }[] | undefined;
}

/** Aliases of one contact: list, add, remove. The contact is read live so the list follows writes. */
export function ContactAliasDialog({
  contactId,
  onClose,
}: {
  contactId: string | null;
  onClose: () => void;
}) {
  const lookups = useQuery(lookupsQuery());
  const contact = contactId ? lookups.data?.contacts.find((c) => c.id === contactId) : undefined;
  return (
    <FormDialog open={contactId !== null} onClose={onClose} title="Aliase">
      {contact && <AliasForm contact={contact} onClose={onClose} />}
    </FormDialog>
  );
}

function AliasForm({ contact, onClose }: { contact: IdentityContact; onClose: () => void }) {
  const write = useContactWrite();
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const aliases = contact.aliases ?? [];
  const run = async (action: () => Promise<{ groupId: string }>, message: string) => {
    setBusy(true);
    const ok = await write(action, message);
    setBusy(false);
    return ok;
  };
  return (
    <form
      className="bkform"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !alias.trim()) return;
        void run(
          () =>
            request('POST', `${contactPath(contact.id)}/aliases`, {
              alias: alias.trim(),
              ...(contact.updatedAt ? { expectedUpdatedAt: contact.updatedAt } : {}),
            }),
          'Alias hinzugefügt.',
        ).then((ok) => {
          if (ok) setAlias('');
        });
      }}
    >
      <div className="bk-head">
        <h2 className="bk-kind-fixed">Aliase von {contact.name}</h2>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ×
          <span className="control-label" aria-hidden="true">
            Schließen
          </span>
        </button>
      </div>
      <div className="bk-body contacts-form">
        <p>
          Aliase sind weitere Namen desselben Kontakts. Sie helfen bei der Suche und beim Zuordnen;
          Buchungen und Salden ändern sich nicht.
        </p>
        {aliases.length === 0 ? (
          <p className="tech">Noch keine Aliase.</p>
        ) : (
          <ul className="contact-alias-list" aria-label={`Aliase von ${contact.name}`}>
            {aliases.map((a) => (
              <li key={a.id}>
                <span>{a.alias}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Alias ${a.alias} entfernen`}
                  onClick={() =>
                    void run(
                      () =>
                        request(
                          'DELETE',
                          `${contactPath(contact.id)}/aliases/${encodeURIComponent(a.id)}?expectedUpdatedAt=${encodeURIComponent(a.updatedAt)}`,
                        ),
                      'Alias entfernt.',
                    )
                  }
                >
                  Entfernen
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Neuer Alias">
          {({ id }) => (
            <TextInput
              id={id}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={200}
            />
          )}
        </Field>
      </div>
      <div className="bk-foot">
        <Button variant="ghost" onClick={onClose}>
          Schließen
        </Button>
        <Button type="submit" disabled={busy || !alias.trim()}>
          Alias hinzufügen
        </Button>
      </div>
    </form>
  );
}

/** Archive a contact; a refusal lists exactly what is still open or linked. */
export function ContactArchiveDialog({
  contact,
  onClose,
}: {
  contact: IdentityContact | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={contact !== null} onClose={onClose} title="Kontakt archivieren">
      {contact && <ArchiveForm contact={contact} onClose={onClose} />}
    </FormDialog>
  );
}

function ArchiveForm({ contact, onClose }: { contact: IdentityContact; onClose: () => void }) {
  const write = useContactWrite();
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<{ kind: string; count: number }[]>([]);
  return (
    <form
      className="bkform"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setBlockers([]);
        void write(
          () =>
            request<{ groupId: string }>('POST', `${contactPath(contact.id)}/archive`, {
              ...(contact.updatedAt ? { expectedUpdatedAt: contact.updatedAt } : {}),
            }).catch((error: unknown) => {
              if (error instanceof ApiError && error.code === 'contact_blocked')
                setBlockers(error.blockers);
              throw error;
            }),
          'Kontakt archiviert.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onClose();
        });
      }}
    >
      <div className="bk-head">
        <h2 className="bk-kind-fixed">„{contact.name}“ archivieren?</h2>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ×
          <span className="control-label" aria-hidden="true">
            Schließen
          </span>
        </button>
      </div>
      <div className="bk-body contacts-form">
        <p>
          Der Kontakt verschwindet aus den Auswahllisten. Verlauf, Salden und Auswertungen bleiben
          unverändert; du kannst ihn jederzeit wieder öffnen.
        </p>
        {blockers.length > 0 && (
          <div role="alert" className="rev-empty">
            <div className="kstate">
              <p>
                <strong>Archivieren geht noch nicht:</strong>
              </p>
              <ul>
                {blockers.map((b) => (
                  <li key={b.kind}>{blockerText(b)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="bk-foot">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy}>
          Archivieren
        </Button>
      </div>
    </form>
  );
}

/** Reopen is a single click with an Undo toast. */
export function useReopenContact() {
  const write = useContactWrite();
  return (contact: IdentityContact) =>
    write(
      () =>
        request('POST', `${contactPath(contact.id)}/reopen`, {
          ...(contact.updatedAt ? { expectedUpdatedAt: contact.updatedAt } : {}),
        }),
      'Kontakt wieder geöffnet.',
    );
}
