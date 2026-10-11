import { validFuturePreviewDays, validAccountReminderDays } from '@budget/domain';
import { Button, Field, SectionHead, TextInput, useToast } from '@budget/ui';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  const key = reminder ? 'accountReminderDays' : 'futurePreviewDays';
  const titleId = reminder ? 'reminder-title' : 'preview-title';
  const label = reminder ? 'Kontoprüfung erinnern nach (Tagen)' : 'Zukunftsvorschau (Tage)';
  const min = reminder ? 1 : 0;
  const query = useQuery(displaySettingsQuery());
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const value = draft ?? String(query.data?.[key] ?? '');
  return (
    <section className="profile-settings" aria-labelledby={titleId}>
      <SectionHead
        id={titleId}
        title={reminder ? 'Kontoprüfung · Erinnerung' : 'Darstellung · Kontovorschau'}
      />
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
            const days = Number(value);
            if (
              !/^\d+$/.test(value) ||
              !(reminder ? validAccountReminderDays(days) : validFuturePreviewDays(days))
            )
              return setError('Bitte eine ganze Zahl von ' + min + ' bis 365 eintragen.');
            setBusy(true);
            void request<{ groupId: string }>('PATCH', '/api/display-settings', { [key]: days })
              .then((result) => {
                void qc.invalidateQueries({ queryKey: displaySettingsQuery().queryKey });
                void qc.invalidateQueries({ queryKey: LEDGER_KEY });
                setDraft(undefined);
                setError(undefined);
                toast.show({
                  message: reminder
                    ? 'Kontoprüfung-Erinnerung gespeichert.'
                    : 'Kontovorschau gespeichert.',
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
              })
              .catch((e: unknown) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Field
            label={label}
            error={error}
            hint={
              reminder
                ? '1–365 Tage; Standard 35. Nur offene Konten mit Buchungen. Nie geprüfte Konten zählen ab Eröffnung; P2P und sonstige Vermögenswerte ab der letzten Bewertung.'
                : '0–365 Tage; Standard 35. 0 blendet die Vorschau im Saldoverlauf aus.'
            }
          >
            {({ id, invalid, describedBy }) => (
              <TextInput
                id={id}
                type="number"
                min={min}
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
          <Button type="submit" disabled={busy || !query.data || draft === undefined}>
            Speichern
          </Button>
        </form>
      )}
    </section>
  );
}
