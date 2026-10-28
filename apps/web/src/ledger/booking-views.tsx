import { bookingSearchToSave, type BookingView, type BookingViewsChange, type BookingViewsState, type BookingViewsWrite, type BookingsSearch, type SavedBookingSearch } from '@budget/domain';
import { Button, Field, FormDialog, TextInput, useToast } from '@budget/ui';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { undoGroup } from './api';
import { errorText } from './labels';
import { ErrorNote, LoadingNote } from './states';
import './booking-views.css';

export const BOOKING_VIEWS_KEY = ['booking-saved-views'] as const;
export const bookingViewsQuery = () => queryOptions({
  queryKey: BOOKING_VIEWS_KEY, retry: false,
  queryFn: () => request<BookingViewsState>('GET', '/api/bookings/saved-views'),
});

/** Preference controls live inside the existing actions menu, with no extra toolbar row. */
export function BookingViews({ search, disabled, onOpen }: {
  search: BookingsSearch; disabled: boolean; onOpen: (search: SavedBookingSearch) => void;
}) {
  const [mode, setMode] = useState<'save' | 'manage' | null>(null);
  const [draft, setDraft] = useState<{ name: string; search: SavedBookingSearch; id?: string }>({ name: '', search: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = useQuery({ ...bookingViewsQuery(), enabled: mode !== null, refetchOnMount: 'always' });
  const qc = useQueryClient();
  const toast = useToast();
  const ready = !saved.isPending && !saved.isFetching && !saved.isError && saved.data && !saved.data.unavailable;
  const locked = busy || disabled;
  const refresh = () => qc.invalidateQueries({ queryKey: BOOKING_VIEWS_KEY });
  const offerUndo = (groupId: string) => toast.show({
    message: 'Filteransichten geändert.', actionLabel: 'Rückgängig',
    onAction: () => void undoGroup(groupId).then(async (undone) => {
      await refresh();
      toast.show({ message: 'Rückgängig gemacht.', actionLabel: 'Wiederholen',
        onAction: () => void undoGroup(undone.groupId).then(refresh, (failure: unknown) => toast.show({ message: errorText(failure) })) });
    }, (failure: unknown) => toast.show({ message: errorText(failure) })),
  });
  const write = async (change: BookingViewsChange) => {
    if (!ready || locked) return;
    setBusy(true); setError('');
    try {
      const result = await request<BookingViewsWrite>('POST', '/api/bookings/saved-views', { revision: saved.data!.revision, ...change });
      qc.setQueryData(BOOKING_VIEWS_KEY, result);
      if (result.changed) offerUndo(result.groupId);
      if (change.kind === 'save') setMode(null);
    } catch (failure) {
      setError(`${errorText(failure)} Der Entwurf bleibt erhalten. Gespeicherte Ansichten werden neu geladen.`);
      await saved.refetch();
    } finally { setBusy(false); }
  };
  const open = async (id: string) => {
    if (locked) return;
    setBusy(true); setError('');
    try {
      // Never open a cached tuple after another client changed or removed the view.
      const response = await saved.refetch();
      if (response.isError) throw response.error;
      if (!response.data || response.data.unavailable) { setError('Filteransichten sind nicht verfügbar.'); return; }
      const view = response.data.views.find((item) => item.id === id);
      if (!view) { setError('Diese Filteransicht wurde inzwischen entfernt.'); return; }
      onOpen(view.search); setMode(null);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const edit = (view: BookingView, replace: boolean) => {
    setDraft({ id: view.id, name: view.name, search: replace ? bookingSearchToSave(search) : view.search });
    setError(''); setMode('save');
  };
  return <>
    <Button variant="ghost" disabled={disabled} onClick={() => {
      setDraft({ name: '', search: bookingSearchToSave(search) }); setError(''); setMode('save');
    }}>Ansicht speichern</Button>
    <Button variant="ghost" disabled={disabled} onClick={() => { setError(''); setMode('manage'); }}>Gespeicherte Ansichten</Button>
    <FormDialog open={mode !== null} title={mode === 'save' ? 'Filteransicht speichern' : 'Gespeicherte Filteransichten'} onClose={() => setMode(null)} beforeClose={() => !busy}>
      {(saved.isPending || saved.isFetching) && <LoadingNote what="Filteransichten" />}
      {saved.isError && !saved.isFetching && <ErrorNote what="Filteransichten" error={saved.error} onRetry={() => void saved.refetch()} />}
      {saved.data?.unavailable && <p role="status">Gespeicherte Filteransichten sind nicht verfügbar. Die Daten bleiben erhalten; gewöhnliche Filter funktionieren weiter.</p>}
      {error && <p role="alert">{error}</p>}
      {mode === 'save' ? <form className="booking-views-form" onSubmit={(event) => { event.preventDefault(); void write({ kind: 'save', view: { name: draft.name, search: draft.search }, ...(draft.id ? { id: draft.id } : {}) }); }}>
        {draft.id && <p>Diese gespeicherte Ansicht wird ausdrücklich aktualisiert.</p>}
        <Field label="Name">{({ id }) => <TextInput id={id} value={draft.name} maxLength={40} required disabled={locked} autoComplete="off" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
        <Button type="submit" disabled={!ready || locked || !draft.name.trim()}>Speichern</Button>
      </form> : <div className="booking-views-form">
        {ready && saved.data!.views.length === 0 && <p>Noch keine Filteransichten gespeichert.</p>}
        {ready && saved.data!.views.map((view) => <div className="booking-view-row" key={view.id}>
          <Button variant="ghost" disabled={locked} onClick={() => void open(view.id)}>{view.name}</Button>
          <Button variant="ghost" disabled={locked} aria-label={`Ansicht ${view.name} umbenennen`} onClick={() => edit(view, false)}>Umbenennen</Button>
          <Button variant="ghost" disabled={locked} aria-label={`Filter von ${view.name} ersetzen`} onClick={() => edit(view, true)}>Aktuelle Filter übernehmen</Button>
          <Button variant="ghost" disabled={locked} aria-label={`Ansicht ${view.name} löschen`} onClick={() => void write({ kind: 'delete', id: view.id })}>Löschen</Button>
        </div>)}
      </div>}
    </FormDialog>
  </>;
}
