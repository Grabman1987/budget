import { SettingsReadStamp } from './settings-read-stamp';
import { Button, FormDialog } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ContactRenameDialog, NewContact } from '../contacts/contacts-page';
import { lookupsQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { CONTACT_SETTINGS_META } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from './placeholder-page';

import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { Plus } from 'lucide-react';

/** Contact identity metadata only; balances and financial actions stay on the existing pages. */
export function ContactSettingsPage() {
  const contacts = useQuery(lookupsQuery());
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  if (REDESIGN_ENABLED)
    return (
      <PageFrame meta={CONTACT_SETTINGS_META}>
        <section
          className="contact-settings settings-contacts-v2"
          aria-labelledby="contact-settings-title"
        >
          <div className="settings-primary-head">
            <h2 id="contact-settings-title">Kontakte</h2>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" />
              Neuer Kontakt
            </Button>
          </div>
          {contacts.isPending && <LoadingNote what="Kontakt-Stammdaten" />}
          {contacts.isError && (
            <ErrorNote
              what="Kontakt-Stammdaten"
              error={contacts.error}
              onRetry={() => void contacts.refetch()}
            />
          )}
          {contacts.data &&
            !contacts.isError &&
            (contacts.data.contacts.length === 0 ? (
              <EmptyNote>Noch keine Kontakte angelegt.</EmptyNote>
            ) : (
              <div className="settings-surface" role="region" aria-label="Kontakt-Stammdaten">
                {contacts.data.contacts.map((contact) => (
                  <div className="settings-row" key={contact.id}>
                    <div>
                      <strong>{contact.name}</strong>
                      <small>
                        ID: <span>{contact.id}</span>
                      </small>
                    </div>
                    <div className="settings-row-actions">
                      <Button
                        variant="ghost"
                        aria-label={`${contact.name} umbenennen`}
                        onClick={() => setRenaming(contact)}
                      >
                        Umbenennen
                      </Button>
                      <AppLink
                        className="btn btn-ghost"
                        aria-label={`Verlauf öffnen ${contact.name}`}
                        to={`/konten/kontakte/${encodeURIComponent(contact.id)}`}
                        search={(previous) => ({ ...previous, verlauf: 1 })}
                      >
                        Verlauf öffnen
                      </AppLink>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          <AppLink
            className="btn btn-ghost"
            to="/konten/kontakte"
            search={(previous) => ({ ...previous, verlauf: 1 })}
          >
            Kontaktübersicht öffnen
          </AppLink>
          <p className="settings-source-stamp">
            Stammdaten · Salden, offene Posten und Archiv bleiben in der Kontaktübersicht.
          </p>
          <SettingsReadStamp at={contacts.dataUpdatedAt} label="Stammdaten" />
        </section>
        <FormDialog open={creating} onClose={() => setCreating(false)} title="Neuer Kontakt">
          {creating && (
            <NewContact onClose={() => setCreating(false)} onDone={() => setCreating(false)} />
          )}
        </FormDialog>
        <ContactRenameDialog contact={renaming} onClose={() => setRenaming(null)} />
      </PageFrame>
    );
  return (
    <PageFrame meta={CONTACT_SETTINGS_META}>
      <div className="contacts-page contact-settings">
        <p>
          Hier stehen nur die Stammdaten. Salden, offene Posten und Verlauf bleiben bei Kontakte.
        </p>
        <div className="ptoolbar">
          <AppLink
            className="btn btn-ghost"
            to="/konten/kontakte"
            search={(previous) => ({ ...previous, verlauf: 1 })}
          >
            Kontaktübersicht öffnen
          </AppLink>
          <span className="spacer" />
          <Button onClick={() => setCreating(true)}>Neuer Kontakt</Button>
        </div>
        {(contacts.isPending || contacts.isFetching) && <LoadingNote what="Kontakt-Stammdaten" />}
        {contacts.isError && (
          <ErrorNote
            what="Kontakt-Stammdaten"
            error={contacts.error}
            onRetry={() => void contacts.refetch()}
          />
        )}
        {contacts.data &&
          !contacts.isFetching &&
          !contacts.isError &&
          (contacts.data.contacts.length === 0 ? (
            <EmptyNote>Noch keine Kontakte angelegt.</EmptyNote>
          ) : (
            <table className="contacts-table">
              <caption className="sr-only">Kontakt-Stammdaten</caption>
              <thead>
                <tr>
                  <th scope="col">Kontakt</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {contacts.data.contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <strong>{contact.name}</strong>
                      <p className="tech">
                        ID: <span>{contact.id}</span>
                      </p>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        aria-label={`${contact.name} umbenennen`}
                        onClick={() => setRenaming(contact)}
                      >
                        Umbenennen
                      </Button>
                      <AppLink
                        className="btn btn-ghost"
                        aria-label={`Verlauf öffnen ${contact.name}`}
                        to={`/konten/kontakte/${encodeURIComponent(contact.id)}`}
                        search={(previous) => ({ ...previous, verlauf: 1 })}
                      >
                        Verlauf öffnen
                      </AppLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        <FormDialog open={creating} onClose={() => setCreating(false)} title="Neuer Kontakt">
          {creating && (
            <NewContact onClose={() => setCreating(false)} onDone={() => setCreating(false)} />
          )}
        </FormDialog>
        <ContactRenameDialog contact={renaming} onClose={() => setRenaming(null)} />
      </div>
    </PageFrame>
  );
}
