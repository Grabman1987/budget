import { findPayeeDuplicateGroups } from '@budget/domain';
import { Button, Field, TextInput } from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { request } from '../api/http';
import { useContactWrite } from '../contacts/contacts-page';
import { LEDGER_KEY, payeesQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { longDay, pluralBookings } from '../ledger/format';
import { PAYEE_SETTINGS_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { SettingsFormDialog } from './settings-form-dialog';
import { SettingsReadStamp } from './settings-read-stamp';
import '../contacts/contacts.css';
import './payee-settings.css';

/** Payees (Empfänger): list, possible duplicates, merge into a main payee, aliases. */

interface PayeeAlias {
  id: string;
  rawKey: string;
  payeeId: string;
}
interface MergePreview {
  bookings: number;
  reconciled: number;
  rules: number;
  aliases: string[];
}

const aliasesQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'payee-aliases'],
    queryFn: () => request<{ aliases: PayeeAlias[] }>('GET', '/api/payees/aliases'),
  });

const PAYEE_PAGE = 50;

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-AT');

export function PayeeSettingsPage() {
  const payees = useQuery(payeesQuery());
  const aliases = useQuery(aliasesQuery());
  const write = useContactWrite();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAYEE_PAGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const rows = useMemo(
    () => (payees.data?.payees ?? []).filter((p) => !p.systemKind),
    [payees.data],
  );
  const groups = useMemo(
    () =>
      findPayeeDuplicateGroups(
        rows.map((p) => ({ id: p.id, name: p.name, bookingCount: p.bookingCount ?? 0 })),
      ),
    [rows],
  );
  const shown = rows.filter((p) => fold(p.name).includes(fold(search.trim())));
  const visible = shown.slice(0, limit);
  const aliasesOf = (id: string) => (aliases.data?.aliases ?? []).filter((a) => a.payeeId === id);
  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  const byId = (id: string) => rows.find((p) => p.id === id);
  return (
    <PageFrame meta={PAYEE_SETTINGS_META}>
      <div className="contacts-page contact-settings payee-settings">
        <p>
          Hier stehen alle Empfänger. Mehrere Schreibweisen desselben Händlers kannst du zu einem
          Hauptempfänger zusammenführen; die alten Namen merkt sich die App als Alias. Es wird nie
          automatisch zusammengeführt, und kein Betrag ändert sich.
        </p>
        {payees.isPending && <LoadingNote what="Empfänger" />}
        {payees.isError && (
          <ErrorNote what="Empfänger" error={payees.error} onRetry={() => void payees.refetch()} />
        )}
        {payees.data && !payees.isError && (
          <>
            <section aria-labelledby="payee-dupes-title">
              <h2 id="payee-dupes-title">Mögliche Dubletten</h2>
              {groups.length === 0 ? (
                <EmptyNote>Keine ähnlichen Empfänger gefunden.</EmptyNote>
              ) : (
                <ul className="payee-dupes">
                  {groups.map((group) => (
                    <li key={group.members.map((m) => m.id).join('|')} data-testid="payee-dupe">
                      <strong>{group.members.map((m) => m.name).join(' · ')}</strong>
                      <p className="tech">
                        {group.reason === 'equal' ? 'Gleicher Name' : 'Ähnlicher Name'}
                      </p>
                      <Button
                        variant="ghost"
                        aria-label={`Vorschlag zusammenführen: ${group.members
                          .map((m) => m.name)
                          .join(', ')}`}
                        onClick={() => setMerging(group.members.map((m) => m.id))}
                      >
                        Zusammenführen …
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="payee-list-title">
              <h2 id="payee-list-title">Alle Empfänger</h2>
              <div className="ptoolbar">
                <Field label="Empfänger suchen">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      type="search"
                      autoComplete="off"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setLimit(PAYEE_PAGE);
                      }}
                    />
                  )}
                </Field>
                <span className="spacer" />
                <Button disabled={selected.length < 2} onClick={() => setMerging(selected)}>
                  Ausgewählte zusammenführen ({selected.length})
                </Button>
              </div>
              {shown.length === 0 ? (
                <EmptyNote>
                  {rows.length === 0 ? 'Noch keine Empfänger.' : 'Kein Empfänger gefunden.'}
                </EmptyNote>
              ) : (
                <>
                  <ul className="payee-list">
                    {visible.map((p) => (
                      <li key={p.id} className="payee-item" data-testid="payee-row">
                        <input
                          type="checkbox"
                          aria-label={`${p.name} auswählen`}
                          checked={selected.includes(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                        <div className="payee-item-main">
                          <strong>{p.name}</strong>
                          <small>
                            {pluralBookings(p.bookingCount ?? 0)} · zuletzt{' '}
                            {p.lastBookingDate ? longDay(p.lastBookingDate) : '–'}
                          </small>
                          {aliasesOf(p.id).map((a) => (
                            <small key={a.id}>
                              Alias: {a.rawKey}{' '}
                              <Button
                                variant="ghost"
                                aria-label={`Alias ${a.rawKey} von ${p.name} entfernen`}
                                onClick={() =>
                                  void write(
                                    () =>
                                      request<{ groupId: string }>(
                                        'DELETE',
                                        `/api/payees/aliases/${encodeURIComponent(a.id)}`,
                                      ),
                                    'Alias entfernt.',
                                  )
                                }
                              >
                                Entfernen
                              </Button>
                            </small>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          aria-label={`${p.name} umbenennen`}
                          onClick={() => setRenaming({ id: p.id, name: p.name })}
                        >
                          Umbenennen
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {shown.length > visible.length && (
                    <Button variant="ghost" onClick={() => setLimit((n) => n + PAYEE_PAGE)}>
                      Weitere anzeigen ({shown.length - visible.length})
                    </Button>
                  )}
                </>
              )}
            </section>
          </>
        )}
        <SettingsReadStamp at={payees.dataUpdatedAt} label="Empfänger" />
        <SettingsFormDialog
          open={merging !== null}
          onClose={() => setMerging(null)}
          title="Empfänger zusammenführen"
        >
          {merging && (
            <MergeForm
              members={merging.map(byId).filter((p) => p !== undefined)}
              onClose={() => {
                setMerging(null);
                setSelected([]);
              }}
            />
          )}
        </SettingsFormDialog>
        <SettingsFormDialog
          open={renaming !== null}
          onClose={() => setRenaming(null)}
          title="Empfänger umbenennen"
        >
          {renaming && <RenameForm payee={renaming} onClose={() => setRenaming(null)} />}
        </SettingsFormDialog>
      </div>
    </PageFrame>
  );
}

function RenameForm({
  payee,
  onClose,
}: {
  payee: { id: string; name: string };
  onClose: () => void;
}) {
  const write = useContactWrite();
  const [name, setName] = useState(payee.name);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="contacts-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !name.trim() || name.trim() === payee.name) return;
        setBusy(true);
        void write(
          () =>
            request<{ groupId: string }>('PATCH', `/api/payees/${encodeURIComponent(payee.id)}`, {
              name: name.trim(),
            }),
          'Empfänger umbenannt.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onClose();
        });
      }}
    >
      <div>
        <Field label="Name">
          {({ id }) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </div>
      <div className="ptoolbar">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === payee.name}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

function MergeForm({
  members,
  onClose,
}: {
  members: { id: string; name: string; bookingCount?: number }[];
  onClose: () => void;
}) {
  const write = useContactWrite();
  const [targetId, setTargetId] = useState(members[0]?.id ?? '');
  const [unlock, setUnlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = members.find((m) => m.id === targetId);
  const sourceIds = members.filter((m) => m.id !== targetId).map((m) => m.id);
  const preview = useQuery({
    queryKey: [...LEDGER_KEY, 'payee-merge-preview', targetId, sourceIds],
    enabled: target !== undefined && sourceIds.length > 0,
    queryFn: () =>
      request<MergePreview>('POST', '/api/payees/merge/preview', { sourceIds, targetId }),
  });
  const data = preview.data;
  return (
    <form
      className="contacts-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !data || !target) return;
        setBusy(true);
        void write(
          () =>
            request<{ groupId: string }>('POST', '/api/payees/merge', {
              sourceIds,
              targetId,
              unlockReconciled: unlock,
            }),
          'Empfänger zusammengeführt.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onClose();
        });
      }}
    >
      <div>
        <fieldset>
          <legend>Hauptempfänger</legend>
          {members.map((m) => (
            <label key={m.id} className="payee-main-choice">
              <input
                type="radio"
                name="payee-main"
                checked={m.id === targetId}
                onChange={() => {
                  setTargetId(m.id);
                  setUnlock(false);
                }}
              />
              <span>
                {m.name} <span className="tech">({pluralBookings(m.bookingCount ?? 0)})</span>
              </span>
            </label>
          ))}
        </fieldset>
        {preview.isPending && sourceIds.length > 0 && <LoadingNote what="Vorschau" />}
        {preview.isError && (
          <p role="alert" className="field-error">
            Die Vorschau ist gerade nicht möglich. Bitte versuche es noch einmal.
          </p>
        )}
        {data && target && (
          <div role="region" aria-label="Vorschau der Zusammenführung" className="kstate">
            <p>
              <strong>
                {pluralBookings(data.bookings)}, {data.rules}{' '}
                {data.rules === 1 ? 'Regel wechselt' : 'Regeln wechseln'} zu „{target.name}“.
              </strong>
            </p>
            <ul>
              <li>
                Diese Namen werden Alias des Hauptempfängers: {data.aliases.join(', ')}. Spätere
                Bankzeilen mit diesem Text bekommen ihn als Vorschlag.
              </li>
              {data.reconciled > 0 && (
                <li>
                  {data.reconciled} geprüfte{' '}
                  {data.reconciled === 1 ? 'Buchung bleibt' : 'Buchungen bleiben'} gesperrt, außer
                  du entsperrst sie hier.
                </li>
              )}
            </ul>
            {data.reconciled > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={unlock}
                  onChange={(e) => setUnlock(e.target.checked)}
                />{' '}
                Geprüfte Buchungen ebenfalls umstellen (entsperrt sie dafür)
              </label>
            )}
          </div>
        )}
      </div>
      <div className="ptoolbar">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy || !data}>
          Zusammenführen bestätigen
        </Button>
      </div>
    </form>
  );
}
