import { Button, SectionHead, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useRef, useState, type FormEvent } from 'react';
import { withStepUp } from '../auth/webauthn';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { EINSTELLUNGEN_DATENQUELLEN } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  commitRun,
  deleteRun,
  dryRun,
  exportDate,
  fetchMapping,
  fetchRun,
  fetchRuns,
  importErrorText,
  revertRun,
  saveMapping,
  uploadExport,
  type EvaluationResult,
  type Mapping,
  type Overview,
  type RunView,
} from './api';
import {
  AccountsStep,
  CategoriesStep,
  PayeesStep,
  RulesStep,
  StartStep,
  TYPE_LABEL,
  YearList,
  type StepProps,
} from './steps';

export const STEPS = [
  { id: 'konten', label: 'Konten' },
  { id: 'kategorien', label: 'Kategorien' },
  { id: 'regeln', label: 'Regeln' },
  { id: 'empfaenger', label: 'Empfänger' },
  { id: 'start', label: 'Startmonat' },
  { id: 'probelauf', label: 'Probelauf' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

const STATUS: Record<RunView['status'], string> = {
  staged: 'hochgeladen',
  dry_run: 'Probelauf',
  committed: 'übernommen',
  reverted: 'rückgängig gemacht',
  failed: 'fehlgeschlagen',
};
const RUNS_KEY = ['imports'];

/** Einstellungen › Datenquellen: the YNAB import (runs, upload, wizard). Other sources follow in P4. */
export function DataSourcesPage() {
  const search = useSearch({ strict: false }) as { lauf?: string; schritt?: StepId };
  return (
    <PageFrame meta={EINSTELLUNGEN_DATENQUELLEN}>
      {search.lauf ? <Wizard runId={search.lauf} step={search.schritt ?? 'konten'} /> : <Runs />}
    </PageFrame>
  );
}

function Runs() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const runs = useQuery({ queryKey: RUNS_KEY, queryFn: fetchRuns });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: 'revert' | 'delete' } | null>(null);

  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await withStepUp(action);
      toast.show({ message: done });
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(importErrorText(caught, 'Das hat nicht geklappt.'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await withStepUp(() => uploadExport(files));
      await queryClient.invalidateQueries({ queryKey: RUNS_KEY });
      if (result.sameExportAs.length > 0)
        toast.show({ message: 'Dieser Export wurde schon einmal hochgeladen.' });
      void navigate({
        to: '/einstellungen/datenquellen',
        search: { lauf: result.run.id, schritt: 'konten' },
      } as never);
    } catch (caught) {
      setError(importErrorText(caught, 'Der Export konnte nicht gelesen werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imp">
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="imp-upload">
        <SectionHead id="imp-upload" title="YNAB-Import" />
        <p className="imp-lead">
          In YNAB „Export plan data“ wählen, das ZIP entpacken und beide Dateien („… - Register.tsv“
          und „… - Plan.tsv“) hier hochladen. Sie bleiben nur in der Datenbank und lassen sich je
          Lauf löschen.
        </p>
        <form className="imp-add" onSubmit={(e) => void upload(e)}>
          <label className="imp-field">
            <span className="tech">Exportdateien</span>
            <input
              aria-label="Exportdateien"
              type="file"
              accept=".tsv,text/tab-separated-values"
              multiple
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
          </label>
          <Button type="submit" disabled={busy || files.length !== 2}>
            Hochladen
          </Button>
        </form>
      </section>
      <section aria-labelledby="imp-runs">
        <SectionHead id="imp-runs" title="Importläufe" />
        {runs.isPending && <LoadingNote what="Importläufe" />}
        {runs.isError && (
          <ErrorNote what="Importläufe" error={runs.error} onRetry={() => void runs.refetch()} />
        )}
        {runs.data?.runs.length === 0 && <p className="text-muted">Noch kein Import.</p>}
        {runs.data && runs.data.runs.length > 0 && (
          <table className="ktable imp-table">
            <caption className="sr-only">Importläufe</caption>
            <thead>
              <tr>
                <th className="tech" scope="col">
                  Export vom
                </th>
                <th className="tech" scope="col">
                  Status
                </th>
                <th className="tech kc-num" scope="col">
                  Buchungen
                </th>
                <th className="tech" scope="col">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.data.runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="kname-s">{exportDate(r.fileName)}</span>
                    <span className="kmeta">hochgeladen {longDay(r.startedAt.slice(0, 10))}</span>
                  </td>
                  <td data-label="Status">{STATUS[r.status]}</td>
                  <td className="kc-num" data-label="Buchungen">
                    {r.summary.counts?.bookings ?? '–'}
                  </td>
                  <td className="imp-actions">
                    {confirm?.id === r.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void (confirm.action === 'revert'
                              ? act(() => revertRun(r.id), 'Import rückgängig gemacht.')
                              : act(() => deleteRun(r.id), 'Exportdateien gelöscht.'))
                          }
                        >
                          {confirm.action === 'revert' ? 'Wirklich rückgängig' : 'Wirklich löschen'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                          Abbrechen
                        </Button>
                      </>
                    ) : (
                      <>
                        {(r.status === 'staged' || r.status === 'dry_run') && (
                          <AppLink
                            className="btn btn-ghost btn-sm"
                            to="/einstellungen/datenquellen"
                            search={{ lauf: r.id, schritt: 'konten' } as never}
                          >
                            Fortsetzen
                          </AppLink>
                        )}
                        {r.summary.counts && (
                          <AppLink
                            className="btn btn-ghost btn-sm"
                            to="/einstellungen/datenquellen/abgleich"
                            search={{ lauf: r.id } as never}
                          >
                            Abgleich
                          </AppLink>
                        )}
                        {r.status === 'committed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirm({ id: r.id, action: 'revert' })}
                          >
                            Rückgängig
                          </Button>
                        )}
                        {r.summary.counts && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirm({ id: r.id, action: 'delete' })}
                          >
                            Dateien löschen
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Wizard({ runId, step }: { runId: string; step: StepId }) {
  const run = useQuery({ queryKey: [...RUNS_KEY, runId], queryFn: () => fetchRun(runId) });
  const mapping = useQuery({
    queryKey: [...RUNS_KEY, runId, 'mapping'],
    queryFn: () => fetchMapping(runId),
    staleTime: Infinity,
  });
  if (run.isPending || mapping.isPending) return <LoadingNote what="Importdaten" />;
  if (run.isError || mapping.isError || !run.data.overview)
    return (
      <ErrorNote
        what="Importdaten"
        error={run.error ?? mapping.error}
        onRetry={() => void Promise.all([run.refetch(), mapping.refetch()])}
      />
    );
  return (
    <WizardBody
      runId={runId}
      step={step}
      run={run.data.run}
      overview={run.data.overview}
      initial={mapping.data.mapping}
    />
  );
}

function WizardBody({
  runId,
  step,
  run,
  overview,
  initial,
}: {
  runId: string;
  step: StepId;
  run: RunView;
  overview: Overview;
  initial: Mapping;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Mapping>(initial);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = (schritt: StepId) =>
    void navigate({ to: '/einstellungen/datenquellen', search: { lauf: runId, schritt } } as never);
  const save = async (next: Mapping) => {
    setBusy(true);
    setError(undefined);
    try {
      await saveMapping(runId, next);
      return true;
    } catch (caught) {
      setError(importErrorText(caught, 'Die Zuordnung ist nicht gültig.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ynab-zuordnung.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = JSON.parse(await file.text()) as Mapping;
      if (await save(next)) setDraft(next);
    } catch {
      setError('Die Datei ist kein gültiges JSON.');
    }
  };

  const index = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[index + 1];
  const props: StepProps = { runId, overview, draft, setDraft };

  return (
    <div className="imp">
      <div className="imp-bar">
        <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/datenquellen">
          Alle Importläufe
        </AppLink>
        <span className="text-muted">Export vom {exportDate(run.fileName)}</span>
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={exportJson}>
          Zuordnung exportieren
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
          Zuordnung importieren
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void importJson(e.target.files?.[0])}
        />
      </div>
      <ol className="imp-steps" aria-label="Schritte des Imports">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === step ? 'step' : undefined}
              onClick={() => void save(draft).then((ok) => ok && go(s.id))}
            >
              <span className="tech">{i + 1}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {step === 'konten' && <AccountsStep {...props} />}
      {step === 'kategorien' && <CategoriesStep {...props} />}
      {step === 'regeln' && <RulesStep {...props} />}
      {step === 'empfaenger' && <PayeesStep {...props} />}
      {step === 'start' && <StartStep {...props} />}
      {step === 'probelauf' && <DryRunStep runId={runId} />}
      {next && (
        <div className="imp-next">
          <Button disabled={busy} onClick={() => void save(draft).then((ok) => ok && go(next.id))}>
            Speichern und weiter: {next.label}
          </Button>
        </div>
      )}
    </div>
  );
}

function DryRunStep({ runId }: { runId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [deleteMissing, setDeleteMissing] = useState(false);
  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await dryRun(runId));
    } catch (caught) {
      setError(importErrorText(caught, 'Der Probelauf ist fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const done = await withStepUp(() => commitRun(runId, deleteMissing));
      await queryClient.invalidateQueries();
      toast.show({
        message: `Import übernommen: ${done.change?.bookings.added ?? 0} Buchungen neu.`,
      });
      void navigate({ to: '/einstellungen/datenquellen' } as never);
    } catch (caught) {
      setError(importErrorText(caught, 'Der Import konnte nicht übernommen werden.'));
    } finally {
      setBusy(false);
    }
  };
  const errors = result?.problems.filter((p) => p.severity === 'error') ?? [];
  const change = result?.change;
  const differences = result?.reconciliation.differences.length ?? 0;
  return (
    <section aria-labelledby="imp-dry">
      <SectionHead id="imp-dry" title="Probelauf" />
      <p className="imp-lead">
        Der Probelauf rechnet alles durch und schreibt nichts. Erst „Übernehmen“ schreibt den Import
        in einem Schritt, der sich als Ganzes rückgängig machen lässt.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button variant={result ? 'ghost' : 'primary'} disabled={busy} onClick={() => void start()}>
        {result ? 'Probelauf wiederholen' : 'Probelauf starten'}
      </Button>
      {busy && !result && <LoadingNote what="Ergebnisse" />}
      {result && (
        <div className="imp-result" aria-live="polite">
          <dl className="imp-facts">
            <div>
              <dt className="tech">Startmonat</dt>
              <dd>{monthLabel(result.startMonth)}</dd>
            </div>
            <div>
              <dt className="tech">Abgleich</dt>
              <dd>
                {differences === 0 ? 'ohne Differenz' : `${differences} Differenzen`} ·{' '}
                <AppLink
                  to="/einstellungen/datenquellen/abgleich"
                  search={{ lauf: runId } as never}
                >
                  Abgleichsbericht
                </AppLink>
              </dd>
            </div>
            {change && (
              <>
                <div>
                  <dt className="tech">Buchungen</dt>
                  <dd>
                    {change.bookings.added} neu · {change.bookings.unchanged} unverändert ·{' '}
                    {change.bookings.updated} mit neuem Status
                    {change.bookings.skipped ? ` · ${change.bookings.skipped} übersprungen` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="tech">Stammdaten</dt>
                  <dd>
                    {change.accounts.created} Konten, {change.categories.created} Kategorien,{' '}
                    {change.payees.created} Empfänger neu · {change.assigned.changed} Monatswerte
                  </dd>
                </div>
              </>
            )}
          </dl>
          {result.problems.length > 0 && (
            <ul className="imp-problems">
              {result.problems.map((p, i) => (
                <li key={i} className={p.severity === 'error' ? 'field-error' : 'text-muted'}>
                  {p.severity === 'error' ? 'Fehler' : 'Hinweis'}: {p.message}
                  {p.lines.length > 0 && ` (Zeile ${p.lines.slice(0, 5).join(', ')})`}
                </li>
              ))}
            </ul>
          )}
          <table className="ktable imp-table">
            <caption className="sr-only">Konten mit Eröffnungssaldo</caption>
            <thead>
              <tr>
                <th className="tech" scope="col">
                  Konto
                </th>
                <th className="tech" scope="col">
                  Eröffnet
                </th>
                <th className="tech kc-num" scope="col">
                  Eröffnungssaldo
                </th>
              </tr>
            </thead>
            <tbody>
              {result.accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="kname-s">{a.name}</span>
                    <span className="kmeta">
                      {TYPE_LABEL[a.type]}
                      {a.onBudget ? ' · Budget' : ''}
                    </span>
                  </td>
                  <td data-label="Eröffnet">{longDay(a.openingDate)}</td>
                  <td className="kc-num" data-label="Eröffnungssaldo">
                    {eur(a.openingBalanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="ktable imp-table">
            <caption className="sr-only">Zielkategorien nach dem Probelauf</caption>
            <thead>
              <tr>
                <th className="tech" scope="col">
                  Zielkategorie
                </th>
                <th className="tech kc-num" scope="col">
                  Quellen
                </th>
                <th className="tech kc-num" scope="col">
                  Buchungen
                </th>
              </tr>
            </thead>
            <tbody>
              {result.structure.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="kname-s">{s.name}</span>
                    <span className="kmeta">
                      {s.group} · <YearList years={s.years} />
                    </span>
                  </td>
                  <td className="kc-num" data-label="Quellen">
                    {s.sources.length}
                  </td>
                  <td className="kc-num" data-label="Buchungen">
                    {s.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {change && change.bookings.missing.length > 0 && (
            <label className="imp-check">
              <input
                type="checkbox"
                checked={deleteMissing}
                onChange={(e) => setDeleteMissing(e.target.checked)}
              />
              {change.bookings.missing.length} Buchungen früherer Importe fehlen im neuen Export –
              beim Übernehmen löschen
            </label>
          )}
          <div className="imp-next">
            <Button disabled={busy || errors.length > 0} onClick={() => void commit()}>
              Import übernehmen
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
