import type { AssignmentRule, listPayeeCleanup } from '@budget/db';
import type { AssignmentRuleInput, PayeeCleanup } from '@budget/domain';
import { Button, Field, SectionHead, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { IncomeMonthRulesSection } from '../pages/income-month-rules';
import { PageFrame } from '../pages/placeholder-page';
import { ScrollRegion } from '../reports/spending-shared';
import { assignmentQuery } from './api';
import { AssignmentEditor } from './rule-editor';
import './assignment.css';

export function AssignmentPage() {
  const rules = useQuery(assignmentQuery),
    write = useBudgetWrite();
  const [editing, setEditing] = useState<AssignmentRuleInput | null>(null),
    [editingId, setEditingId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false);
  const change = async (r: AssignmentRule, enabled: boolean) => {
    setBusy(true);
    const { id, priority, revision, ...input } = r;
    void priority;
    void revision;
    await write(
      () =>
        request<{ groupId: string }>('PUT', '/api/assignment-rules/' + encodeURIComponent(id), {
          ...input,
          enabled,
        }),
      () => (enabled ? 'Regel aktiviert.' : 'Regel deaktiviert.'),
    );
    setBusy(false);
  };
  const move = async (index: number, delta: number) => {
    const ids = rules.data!.rules.map((r) => r.id),
      target = index + delta;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    await write(
      () => request<{ groupId: string }>('PUT', '/api/assignment-rules/order', { ids }),
      () => 'Reihenfolge gespeichert.',
    );
    setBusy(false);
  };
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/zuordnung')!}
      revealCurrentRegister
    >
      <div className="assignment-page">
        <section aria-labelledby="assignment-title">
          <SectionHead
            id="assignment-title"
            title="Zuordnungsregeln"
            aside={
              rules.data ? `${rules.data.rules.filter((r) => r.enabled).length} aktiv` : undefined
            }
          />
          <p>
            Regeln schlagen Empfänger, Kategorien und weitere Angaben für Bankumsätze vor. Die erste
            passende Regel hat Vorrang. Die Buchung bestätigst du im Posteingang.
          </p>
          <Button
            onClick={(e) => {
              e.currentTarget.focus();
              setEditing(null);
              setEditingId(undefined);
              setCreate(true);
            }}
          >
            Regel erstellen
          </Button>
          {rules.isPending && <LoadingNote what="Zuordnungsregeln" />}
          {rules.isError && (
            <ErrorNote
              what="Zuordnungsregeln"
              error={rules.error}
              onRetry={() => void rules.refetch()}
            />
          )}
          {rules.data?.rules.length === 0 && (
            <EmptyNote>
              Noch keine Regeln. Erstelle eine Regel oder lerne sie aus einer kategorisierten
              Bankbuchung.
            </EmptyNote>
          )}
          {!!rules.data?.rules.length && (
            <ScrollRegion label="Regelliste und Reihenfolge">
              <table className="rtable">
                <caption className="sr-only">Reihenfolge und Status der Zuordnungsregeln</caption>
                <thead>
                  <tr>
                    <th scope="col">Pos.</th>
                    <th scope="col">Regel</th>
                    <th scope="col">Übernahme</th>
                    <th scope="col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.data.rules.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <th scope="row">
                        {r.name}
                        <span className="text-muted"> · {r.enabled ? 'aktiv' : 'deaktiviert'}</span>
                      </th>
                      <td>{r.automatic ? 'automatisch vorbereitet' : 'Vorschlag'}</td>
                      <td>
                        <div className="assignment-buttons">
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={(e) => {
                              e.currentTarget.focus();
                              setEditing(r);
                              setEditingId(r.id);
                              setCreate(true);
                            }}
                          >
                            Bearbeiten<span className="sr-only">: {r.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void change(r, !r.enabled)}
                          >
                            {r.enabled ? 'Deaktivieren' : 'Aktivieren'}
                            <span className="sr-only">: {r.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy || i === 0}
                            aria-label={`${r.name} nach oben`}
                            onClick={() => void move(i, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy || i === rules.data!.rules.length - 1}
                            aria-label={`${r.name} nach unten`}
                            onClick={() => void move(i, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              void write(
                                () =>
                                  request<{ groupId: string }>(
                                    'DELETE',
                                    '/api/assignment-rules/' + encodeURIComponent(r.id),
                                  ),
                                () => 'Regel entfernt.',
                              ).finally(() => setBusy(false));
                            }}
                          >
                            Entfernen<span className="sr-only">: {r.name}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
        </section>
        <CleanupSettings />
        <IncomeMonthRulesSection />
      </div>
      {create && (
        <AssignmentEditor
          initial={editing ?? undefined}
          id={editingId}
          onClose={() => setCreate(false)}
        />
      )}
    </PageFrame>
  );
}

function CleanupSettings() {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'payee-cleanup'],
    queryFn: () =>
      request<{ sources: ReturnType<typeof listPayeeCleanup> }>(
        'GET',
        '/api/assignment-rules/cleanup',
      ),
  });
  const [sourceId, setSource] = useState('');
  return (
    <section aria-labelledby="cleanup-title">
      <SectionHead id="cleanup-title" title="Empfänger aus Banktext bereinigen" />
      <p>
        Der ursprüngliche Banktext bleibt erhalten. Korrigierte Empfänger werden für denselben
        Rohtext und dieselbe Datenquelle gemerkt.
      </p>
      {query.isPending && <LoadingNote what="Bereinigung" />}
      {query.isError && (
        <ErrorNote what="Bereinigung" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <>
          <Field label="Datenquelle für Bereinigung">
            {({ id }) => (
              <Select id={id} value={sourceId} onChange={(e) => setSource(e.target.value)}>
                {query.data.sources.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <CleanupForm
            key={
              sourceId + JSON.stringify(query.data.sources.find((s) => s.id === sourceId)?.config)
            }
            sourceId={sourceId}
            initial={query.data.sources.find((s) => s.id === sourceId)!.config}
          />
        </>
      )}
    </section>
  );
}
function CleanupForm({ sourceId, initial }: { sourceId: string; initial: PayeeCleanup }) {
  const [config, setConfig] = useState(initial),
    [prefixes, setPrefixes] = useState(initial.prefixes.join(', ')),
    [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  return (
    <form
      className="assignment-cleanup"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void write(
          () =>
            request<{ groupId: string }>('PUT', '/api/assignment-rules/cleanup', {
              sourceId,
              config: {
                ...config,
                prefixes: prefixes
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            }),
          () => 'Bereinigung gespeichert.',
        ).finally(() => setBusy(false));
      }}
    >
      <fieldset disabled={busy}>
        {(
          [
            ['useMemo', 'Verwendungszweck statt Empfängername verwenden'],
            ['stripSepa', 'SEPA-Präfixe entfernen'],
            ['stripCards', 'Kartennummern entfernen'],
            ['stripDates', 'Datumsangaben entfernen'],
            ['stripReferences', 'Referenzen entfernen'],
          ] as const
        ).map(([key, label]) => (
          <label className="assignment-check" key={key}>
            <input
              type="checkbox"
              checked={config[key]}
              onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
        <Field label="Zusätzliche Präfixe (mit Komma getrennt)">
          {({ id }) => (
            <TextInput id={id} value={prefixes} onChange={(e) => setPrefixes(e.target.value)} />
          )}
        </Field>
      </fieldset>
      <Button type="submit" disabled={busy}>
        Bereinigung speichern
      </Button>
    </form>
  );
}
