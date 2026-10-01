import { Button, CircleNumber, cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { KONTEN_KONTAKTE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { contactsQuery, type ContactTotals, type ContactView } from './contacts-api';
import { BALANCE_LABEL, balanceKind, openItemsText, summaryLine } from './contacts-model';
import { ContactPanel, type ContactPanelState } from './contact-panel';

/**
 * Konten › Kontakte: the people the household pays for or with, as a parts list. Saldo is what the
 * contact owes (Forderung +) or is owed (Verbindlichkeit −), derived from the contact splits and
 * settled oldest first; it is NOT part of the net worth. A row opens the Kontoblatt in the side
 * panel (bottom sheet on the phone). Every figure comes from `/api/contacts`.
 */
export function ContactsPage() {
  const contacts = useQuery(contactsQuery());
  const [panel, setPanel] = useState<ContactPanelState>({ mode: 'closed' });
  const list = contacts.data?.contacts ?? [];
  const open = panel.mode === 'edit' ? list.find((c) => c.id === panel.id) : undefined;

  return (
    <PageFrame meta={KONTEN_KONTAKTE}>
      <div className="kview contacts">
        <div className="kbar">
          <span className="contacts-summary" data-testid="contacts-summary">
            {contacts.data ? summaryLine(contacts.data.totals, list.length) : ''}
          </span>
          <Button size="sm" onClick={() => setPanel({ mode: 'create' })}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Neuer Kontakt
          </Button>
        </div>
        {contacts.isPending && <LoadingNote what="Kontakte" />}
        {contacts.isError && (
          <ErrorNote
            what="Kontakte"
            error={contacts.error}
            onRetry={() => void contacts.refetch()}
          />
        )}
        {contacts.data && list.length === 0 && (
          <EmptyNote
            action={
              <Button size="sm" onClick={() => setPanel({ mode: 'create' })}>
                Ersten Kontakt anlegen
              </Button>
            }
          >
            Ein Kontakt ist eine Person ohne Login. Zahlst du etwas für sie, bucht die Aufteilung
            eine Auslage, und das Kontoblatt zeigt, was noch offen ist.
          </EmptyNote>
        )}
        {contacts.data && list.length > 0 && (
          <ContactsTable contacts={list} totals={contacts.data.totals} onOpen={setPanel} />
        )}
        <p className="ksum contacts-note">
          Forderungen an Kontakte zählen nicht zum Nettovermögen: Eine Auslage senkt es, bis sie
          zurückgezahlt ist.
        </p>
      </div>
      <ContactPanel state={panel} contact={open} onClose={() => setPanel({ mode: 'closed' })} />
    </PageFrame>
  );
}

function ContactsTable({
  contacts,
  totals,
  onOpen,
}: {
  contacts: ContactView[];
  totals: ContactTotals;
  onOpen: (state: ContactPanelState) => void;
}) {
  const saldo = contacts.reduce((sum, c) => sum + c.balanceCents, 0);
  const expected = contacts.reduce((sum, c) => sum + c.expectedContributionCents, 0);
  return (
    <section className="kaccts" aria-labelledby="contacts-title">
      <h2 className="sr-only" id="contacts-title">
        Kontakte mit Saldo
      </h2>
      <table className="ktable ctable">
        <caption className="sr-only">
          Kontakte mit offenen Posten, erwarteten Beiträgen der nächsten 30 Tage und Saldo
        </caption>
        <thead>
          <tr>
            <th className="tech kc-pos" scope="col">
              Pos.
            </th>
            <th className="tech" scope="col">
              Kontakt
            </th>
            <th className="tech kc-num" scope="col">
              Offene Posten
            </th>
            <th className="tech kc-num" scope="col">
              Erwartet in 30 Tagen
            </th>
            <th className="tech kc-num" scope="col">
              Saldo
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="kgroup">
            <td className="kc-pos">
              <CircleNumber n={1} size="sm" />
            </td>
            <td>
              <span className="grp-title">Kontakte</span>
              <span className="grp-sub">Forderung +, Verbindlichkeit −</span>
            </td>
            <td className="kc-num cc-open" data-label="Offene Posten">
              {totals.openItemCount}
            </td>
            <td className="kc-num cc-expected" data-label="Erwartet in 30 Tagen">
              {eur(expected)}
            </td>
            <td className="kc-num cc-saldo" data-label="Saldo" data-testid="contacts-saldo">
              {eur(saldo)}
            </td>
          </tr>
          {contacts.map((c, i) => (
            <ContactRow
              key={c.id}
              contact={c}
              pos={`1.${i + 1}`}
              onOpen={() => onOpen({ mode: 'edit', id: c.id })}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ContactRow({
  contact: c,
  pos,
  onOpen,
}: {
  contact: ContactView;
  pos: string;
  onOpen: () => void;
}) {
  const kind = balanceKind(c);
  return (
    <tr className="krow ctr" data-testid="contact-row">
      <td className="kc-pos">
        <span className="pos">{pos}</span>
      </td>
      <td>
        <button type="button" className="kname-btn" onClick={onOpen}>
          <span className="kname-s">{c.name}</span>
        </button>
        <span className="kmeta">
          <span className={cx('cc-kind', `is-${kind}`)}>{BALANCE_LABEL[kind]}</span>
          {c.note && <span>{c.note}</span>}
        </span>
      </td>
      <td className="kc-num cc-open" data-label="Offene Posten">
        {c.openItemCount > 0 ? (
          <>
            <span>{c.openItemCount}</span>
            <span className="cc-sub">{eur(c.openCents)}</span>
          </>
        ) : (
          <span className="muted">–</span>
        )}
      </td>
      <td className="kc-num cc-expected" data-label="Erwartet in 30 Tagen">
        {c.expectedContributionCents > 0 ? (
          <span>{eur(c.expectedContributionCents)}</span>
        ) : (
          <span className="muted">–</span>
        )}
        {c.expectedPassThroughCents > 0 && (
          <span className="cc-sub">+ {eur(c.expectedPassThroughCents)} weitergereicht</span>
        )}
      </td>
      <td className="kc-num cc-saldo" data-label="Saldo">
        <span className={cx(kind === 'settled' && 'muted')}>{eur(c.balanceCents)}</span>
        <span className="sr-only">{`, ${openItemsText(c.openItemCount)}`}</span>
      </td>
    </tr>
  );
}
