import { ReadSourceDetail } from './read-source-detail';
import { Button, DetailPanel, RevisionTriangle, SectionHead, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { BookingPanel } from '../ledger/booking-panel';
import { longDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { useLedgerWrites } from '../ledger/mutations';
import { LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { PAGES } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { inboxQuery, resolveInbox, type InboxEntry, type InboxKind, type InboxStored } from './api';
import './inbox.css';
const META = PAGES.find((p) => p.path === '/konten/posteingang')!;
const LABELS: Record<InboxKind, string> = {
  uncategorized: 'Buchungen ohne Kategorie',
  revision: 'Vorschläge',
  import: 'Datenprüfung',
  stale_value: 'Veraltete Werte',
  consent: 'Einwilligungen',
  overspent: 'Überzogene Kategorien',
  expected_payment: 'Erwartete Zahlungen',
  receivable: 'Kontakte',
  reconciliation: 'Kontoprüfung',
  backup: 'Sicherung',
  other: 'Weitere Aufgaben',
};

export function InboxPage() {
  return (
    <PageFrame meta={META}>
      <InboxWorkflow />
    </PageFrame>
  );
}
export function InboxPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <InboxWorkflow panel={{ open, onClose }} />;
}

/** Same queue/actions in page and global panel; booking editor replaces the panel to avoid nested modals. */
function InboxWorkflow({ panel }: { panel?: { open: boolean; onClose: () => void } }) {
  const [editing, setEditing] = useState<ListedBooking | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  // Native dialogs lose the original trigger across the editor handoff; retain it for the whole workflow.
  useLayoutEffect(() => {
    if (panel?.open)
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [panel?.open]);
  useEffect(() => {
    if (panel?.open === false) trigger.current?.focus();
  }, [panel?.open]);
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const edit = async (id: string) => {
    if (loading) return;
    setLoading(id);
    try {
      const { booking } = await request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(id)}`,
      );
      setEditing(booking);
    } catch (error) {
      toast.show({ message: errorText(error) });
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
    } finally {
      setLoading(null);
    }
  };
  const body = <InboxBody onEdit={(id) => void edit(id)} loadingId={loading} />;
  return (
    <>
      {panel ? (
        <DetailPanel
          open={panel.open && !editing}
          onClose={() => {
            if (!editing) panel.onClose();
          }}
          title="Posteingang"
        >
          {panel.open && body}
          <AppLink to="/konten/posteingang" search={{}} className="btn btn-ghost">
            Alle Aufgaben anzeigen
          </AppLink>
        </DetailPanel>
      ) : (
        body
      )}
      <BookingPanel
        state={editing && (!panel || panel.open) ? { mode: 'edit', booking: editing } : null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function InboxBody({
  onEdit,
  loadingId,
}: {
  onEdit: (id: string) => void;
  loadingId: string | null;
}) {
  const headingId = useId();
  const queue = useQuery(inboxQuery());
  const writes = useLedgerWrites();
  const write = useBudgetWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (item: InboxStored) => {
    if (busy) return;
    setBusy(item.id);
    await write(
      () => resolveInbox(item.id),
      () => 'Aufgabe als erledigt markiert.',
    );
    setBusy(null);
  };
  const groups = Object.keys(LABELS) as InboxKind[];
  let index = 0;
  return (
    <section className="kinbox" aria-labelledby={headingId}>
      <SectionHead
        id={headingId}
        title="Offene Entscheidungen"
        aside={queue.data ? `${queue.data.count} offen` : undefined}
      />
      {queue.isPending && <LoadingNote what="Aufgaben" />}
      {queue.isError && (
        <ErrorNote what="Aufgaben" error={queue.error} onRetry={() => void queue.refetch()} />
      )}
      {queue.data?.count === 0 && (
        <EmptyNote>Posteingang leer. Es sind keine offenen Aufgaben vorhanden.</EmptyNote>
      )}
      {queue.data && queue.data.count > 0 && (
        <>
          <table className="rev-table kinbox-table">
            <caption className="sr-only">Offene Entscheidungen nach Typ</caption>
            <thead>
              <tr>
                <th className="tech rev-mark" scope="col">
                  Rev.
                </th>
                <th className="tech" scope="col">
                  Änderung
                </th>
                <th className="tech rev-act" scope="col">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((kind) => {
                const items = queue.data.entries.filter((item) => item.kind === kind);
                if (!items.length) return [];
                return [
                  <tr className="kgroup" key={kind}>
                    <td className="rev-mark" />
                    <th scope="rowgroup" colSpan={2}>
                      {LABELS[kind]} <span className="kgcount">{items.length}</span>
                    </th>
                  </tr>,
                  ...items.map((item) => (
                    <InboxRow
                      key={item.id}
                      item={item}
                      letter={String.fromCharCode(65 + (index++ % 26))}
                      busy={
                        busy === item.id ||
                        (loadingId !== null &&
                          item.type === 'booking' &&
                          loadingId === item.bookingId)
                      }
                      onEdit={onEdit}
                      onResolve={() => {
                        if (item.type === 'stored') void resolve(item);
                      }}
                      onConfirm={(id) =>
                        writes.patch.mutate({ id, patch: { status: 'confirmed' } })
                      }
                      confirming={writes.patch.isPending}
                    />
                  )),
                ];
              })}
            </tbody>
          </table>
          <p className="inbox-hint">
            Eine Warnung nur als erledigt markieren, wenn ihre Ursache geklärt ist. Das Markieren
            ändert keine Buchung und repariert keine Datenquelle.
          </p>
        </>
      )}
    </section>
  );
}

function InboxRow({
  item,
  letter,
  busy,
  onEdit,
  onResolve,
  onConfirm,
  confirming,
}: {
  item: InboxEntry;
  letter: string;
  busy: boolean;
  onEdit: (id: string) => void;
  onResolve: () => void;
  onConfirm: (id: string) => void;
  confirming: boolean;
}) {
  return (
    <tr className={`rev-row${item.urgent ? ' is-urgent' : ''}`} data-testid="inbox-row">
      <td className="rev-mark">
        <RevisionTriangle letter={letter} urgent={item.urgent} />
      </td>
      <td className="rev-what">
        <strong>
          {item.type === 'booking'
            ? `${item.payeeName ?? 'Buchung ohne Empfänger'} · ${nativeCurrency(item.amountCents, item.currency)}`
            : item.title}
        </strong>
        {item.type === 'stored' && item.refType === 'read_source' ? (
          <ReadSourceDetail detail={item.detail} />
        ) : (
          <span>
            {item.type === 'booking'
              ? `${longDay(item.date)} · ${item.accountName} · ${item.missingSplits} ${item.missingSplits === 1 ? 'Anteil' : 'Anteile'} ohne Kategorie${item.status === 'pending' ? ' · vorgemerkt' : ''}${item.memo ? ` · ${item.memo}` : ''}`
              : item.detail}
          </span>
        )}
      </td>
      <td className="rev-act kact">
        {item.type === 'booking' ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onEdit(item.bookingId)}
            >
              Zuordnen
            </Button>
            {item.status === 'pending' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={confirming}
                onClick={() => onConfirm(item.bookingId)}
              >
                Bestätigen
              </Button>
            )}
          </>
        ) : (
          <>
            <SourceLink item={item} />
            <Button
              size="sm"
              variant={item.urgent ? 'alert' : 'ghost'}
              disabled={busy}
              onClick={onResolve}
            >
              Als erledigt markieren
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

/** Offer only connected repair views; unknown/legacy references stay readable without inert links. */
function SourceLink({ item }: { item: InboxStored }) {
  if (item.refType === 'read_source')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/datenquellen">
        Datenquelle prüfen
      </AppLink>
    );
  if (item.refType === 'category')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/plan/monat">
        Im Plan prüfen
      </AppLink>
    );
  if (item.refType === 'expected_payment')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/plan/erwartet">
        Erwartete Zahlung prüfen
      </AppLink>
    );
  if (item.refType === 'encrypted_backup')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/sicherheit">
        Sicherheit prüfen
      </AppLink>
    );
  return null;
}
