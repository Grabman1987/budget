import { validFuturePreviewDays } from '@budget/domain';
import { Button, Field, SectionHead, TextInput, useToast } from '@budget/ui';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { undoGroup } from '../ledger/api';

export const displaySettingsQuery = () =>
  queryOptions({
    queryKey: ['display-settings'],
    queryFn: () => request<{ futurePreviewDays: number }>('GET', '/api/display-settings'),
  });
export function FuturePreviewSetting() {
  const query = useQuery(displaySettingsQuery());
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const value = draft ?? String(query.data?.futurePreviewDays ?? '');
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
            const days = Number(value);
            if (!/^\d+$/.test(value) || !validFuturePreviewDays(days))
              return setError('Bitte eine ganze Zahl von 0 bis 365 eintragen.');
            setBusy(true);
            void request<{ futurePreviewDays: number; groupId: string }>(
              'PATCH',
              '/api/display-settings',
              { futurePreviewDays: days },
            )
              .then((result) => {
                qc.setQueryData(displaySettingsQuery().queryKey, {
                  futurePreviewDays: result.futurePreviewDays,
                });
                setDraft(undefined);
                setError(undefined);
                toast.show({
                  message: 'Kontovorschau gespeichert.',
                  actionLabel: 'Rückgängig',
                  onAction: () =>
                    void undoGroup(result.groupId)
                      .then(() => qc.invalidateQueries({ queryKey: ['display-settings'] }))
                      .catch((e: unknown) => toast.show({ message: errorText(e) })),
                });
              })
              .catch((e: unknown) => setError(errorText(e)))
              .finally(() => setBusy(false));
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
          <Button type="submit" disabled={busy || !query.data || draft === undefined}>
            Speichern
          </Button>
        </form>
      )}
    </section>
  );
}
