import {
  DEFAULT_INBOX_WARN_AGE_DAYS,
  DEFAULT_INBOX_WARN_COUNT,
  validInboxWarnAgeDays,
  validInboxWarnCount,
} from '@budget/domain';
import { Button, Field, SectionHead, TextInput, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { INBOX_KEY } from '../inbox/api';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { displaySettingsQuery } from './future-preview-setting';

/** Einstellungen › Prüfen-Warnung: when the Prüfen counter turns from neutral to a warning. */
export function InboxWarningSetting() {
  const query = useQuery(displaySettingsQuery());
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<{ age?: string; count?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const age = draft.age ?? String(query.data?.inboxWarnAgeDays ?? DEFAULT_INBOX_WARN_AGE_DAYS);
  const count = draft.count ?? String(query.data?.inboxWarnCount ?? DEFAULT_INBOX_WARN_COUNT);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: displaySettingsQuery().queryKey }),
      qc.invalidateQueries({ queryKey: INBOX_KEY }),
    ]);
  return (
    <section className="profile-settings" aria-labelledby="inbox-warning-title">
      <SectionHead id="inbox-warning-title" title="Prüfen · Warnung" />
      <p>
        Prüfen zeigt eine Warnung, sobald eine Buchung ohne Kategorie älter als das Alter ist oder
        mehr Einträge offen sind als die Anzahl.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const days = Number(age);
          const limit = Number(count);
          if (!/^\d+$/.test(age) || !validInboxWarnAgeDays(days))
            return setError('Bitte beim Alter eine ganze Zahl von 1 bis 365 eintragen.');
          if (!/^\d+$/.test(count) || !validInboxWarnCount(limit))
            return setError('Bitte bei der Anzahl eine ganze Zahl von 1 bis 9999 eintragen.');
          setBusy(true);
          request<{ groupId: string }>('PATCH', '/api/display-settings', {
            inboxWarnAgeDays: days,
            inboxWarnCount: limit,
          })
            .then((result) => {
              void refresh();
              setDraft({});
              setError(undefined);
              toast.show({
                message: 'Prüfen-Warnung gespeichert.',
                actionLabel: 'Rückgängig',
                onAction: () =>
                  void undoGroup(result.groupId)
                    .then(refresh)
                    .catch((e: unknown) => toast.show({ message: errorText(e) })),
              });
            })
            .catch((e: unknown) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        <Field
          label="Warnen ab Alter (Tage)"
          hint={`1–365 Tage; Standard ${DEFAULT_INBOX_WARN_AGE_DAYS}. Warnung ab dem Tag danach.`}
          error={error}
        >
          {({ id, invalid, describedBy }) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={365}
              step={1}
              value={age}
              disabled={busy || !query.data}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => {
                setDraft({ ...draft, age: e.target.value });
                setError(undefined);
              }}
            />
          )}
        </Field>
        <Field
          label="Warnen ab Anzahl offener Einträge"
          hint={`Standard ${DEFAULT_INBOX_WARN_COUNT}. Warnung ab einem Eintrag mehr.`}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={9999}
              step={1}
              value={count}
              disabled={busy || !query.data}
              aria-describedby={describedBy}
              onChange={(e) => {
                setDraft({ ...draft, count: e.target.value });
                setError(undefined);
              }}
            />
          )}
        </Field>
        <Button
          type="submit"
          disabled={busy || !query.data || (draft.age === undefined && draft.count === undefined)}
        >
          Speichern
        </Button>
      </form>
    </section>
  );
}
