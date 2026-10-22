import { useUnsavedSettings } from '../settings/use-unsaved-settings';
import { validFuturePreviewDays } from '@budget/domain';
import { Button, Field, SectionHead, TextInput, useToast } from '@budget/ui';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { undoGroup } from '../ledger/api';
import { LEDGER_KEY } from '../ledger/queries';

export const displaySettingsQuery = () =>
  queryOptions({
    queryKey: ['display-settings'],
    queryFn: () =>
      request<{ futurePreviewDays: number; accountReminderDays: number }>(
        'GET',
        '/api/display-settings',
      ),
  });
export function FuturePreviewSetting({ reminder = false }: { reminder?: boolean }) {
  return reminder ? (
    <section className="profile-settings" aria-labelledby="reminder-title">
      <SectionHead id="reminder-title" title="Kontoprüfung · Erinnerung" />
      <p>
        Budget-Konten und Kreditkarten: nach 14 Tagen. Kredite und Investments: nach einem
        Kalendermonat.
      </p>
      <p>
        Ohne neue Buchungen seit der Prüfung bleibt ein Konto geprüft. Bei P2P und sonstigen
        Vermögenswerten zählt die letzte Bewertung.
      </p>
      <p>
        Nie geprüfte Konten werden ab Eröffnung beurteilt. Geschlossene Konten und Konten ohne
        Buchungen werden nicht angemahnt.
      </p>
      <p>Für Forderungen bleibt der bisherige Erinnerungsabstand bestehen.</p>
    </section>
  ) : (
    <FuturePreviewEditor />
  );
}

function FuturePreviewEditor() {
  const query = useQuery(displaySettingsQuery());
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const value = draft ?? String(query.data?.futurePreviewDays ?? '');
  const dirty = draft !== undefined && value !== String(query.data?.futurePreviewDays ?? '');
  useUnsavedSettings(dirty, busy);
  useEffect(() => {
    if (!dirty || busy || error || !query.data) return;
    const timer = window.setTimeout(() => void save(), 600);
    return () => window.clearTimeout(timer);
    // The current value and query snapshot identify the scheduled save; the callback changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dirty, busy, error, query.data]);

  const save = async () => {
    if (inFlight.current || !dirty || !query.data) return;
    const days = Number(value);
    if (!/^\d+$/.test(value) || !validFuturePreviewDays(days))
      return setError('Bitte eine ganze Zahl von 0 bis 365 eintragen.');
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await request<{ groupId: string }>('PATCH', '/api/display-settings', {
        futurePreviewDays: days,
      });
      qc.setQueryData(displaySettingsQuery().queryKey, (
        previous: { futurePreviewDays: number; accountReminderDays: number } | undefined,
      ) =>
        previous ? { ...previous, futurePreviewDays: days } : previous,
      );
      setDraft(undefined);
      setError(undefined);
      void qc.invalidateQueries({ queryKey: displaySettingsQuery().queryKey });
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
      toast.show({
        message: 'Gespeichert · Kontovorschau',
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(result.groupId)
            .then(() =>
              Promise.all([
                qc.invalidateQueries({ queryKey: ['display-settings'] }),
                qc.invalidateQueries({ queryKey: LEDGER_KEY }),
              ]),
            )
            .catch((e: unknown) => toast.show({ message: errorText(e) })),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="profile-settings" aria-labelledby="preview-title">
      <SectionHead id="preview-title" title="Darstellung · Kontovorschau" />
      {query.isError ? (
        <p role="alert">
          {errorText(query.error)}{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field
            label="Zukunftsvorschau (Tage)"
            error={error}
            hint="0–365 Tage; Standard 35. 0 blendet die Vorschau im Saldoverlauf aus."
          >
            {({ id, invalid, describedBy }) => (
              <TextInput
                id={id}
                type="number"
                min={0}
                max={365}
                step={1}
                value={value}
                disabled={busy || !query.data}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          {busy && <p role="status">Speichert …</p>}
          {error && dirty && (
            <Button type="submit" disabled={busy || !query.data}>
              Erneut versuchen
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
