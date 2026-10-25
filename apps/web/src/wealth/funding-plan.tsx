import { useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { Button, Field, Select, TextInput, useAmountPrivacy, maskMoneyText } from '@budget/ui';
import {
  calculateFunding,
  fundingTemplate,
  parseAmount,
  cents,
  formatDecimal,
  type FundingPlan,
  type FundingPlanState,
} from '@budget/domain';
import { request } from '../api/http';
import { LEDGER_KEY, accountsQuery } from '../ledger/queries';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { useBudgetWrite } from '../budget/use-category-writes';
import { instrumentsQuery, portfolioPositionsQuery } from './portfolio-api';
import { savingsPlansQuery } from './savings-api';
import { SavingsPanel } from './savings-panel';
import './funding-plan.css';

const fundingQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'funding-plan'],
    retry: false,
    queryFn: () => request<FundingPlanState>('GET', '/api/portfolio/funding-plan'),
  });
const decimal = (v: number) => formatDecimal(cents(v));
function draftOf(p: FundingPlan) {
  return {
    ...p,
    monthlyCents: decimal(p.monthlyCents),
    oneOffCents: decimal(p.oneOffCents),
    freeCashCents: decimal(p.freeCashCents),
    fixedFeeCents: decimal(p.fixedFeeCents),
    variableFeeBp: decimal(p.variableFeeBp),
    maxFeeBp: decimal(p.maxFeeBp),
    rows: p.rows.map((r) => ({
      ...r,
      valueCents: decimal(r.valueCents),
      priceCents: decimal(r.priceCents),
    })),
    stages: p.stages.map((s) => ({
      fromCents: decimal(s.fromCents),
      weights: s.weights.map(decimal),
    })),
  };
}
type Draft = ReturnType<typeof draftOf>;
function parsed(v: string): number {
  const value = parseAmount(v);
  if (!value.ok || value.cents < 0)
    throw new Error('Bitte alle Beträge und Gewichte vollständig und nicht negativ eingeben.');
  return value.cents;
}
function planOf(p: Draft): FundingPlan {
  return {
    ...p,
    monthlyCents: parsed(p.monthlyCents),
    oneOffCents: parsed(p.oneOffCents),
    freeCashCents: parsed(p.freeCashCents),
    fixedFeeCents: parsed(p.fixedFeeCents),
    variableFeeBp: parsed(p.variableFeeBp),
    maxFeeBp: parsed(p.maxFeeBp),
    rows: p.rows.map((r) => ({
      ...r,
      valueCents: parsed(r.valueCents),
      priceCents: parsed(r.priceCents),
    })),
    stages: p.stages.map((s) => ({
      fromCents: parsed(s.fromCents),
      weights: s.weights.map(parsed),
    })),
  };
}
export function FundingPlanner() {
  const state = useQuery(fundingQuery());
  return (
    <details className="funding-planner">
      <summary>Anlageplan: Vermögen, Sparrate und nächste Käufe</summary>
      {state.isPending && <LoadingNote what="Anlageplan" />}
      {state.isError && (
        <ErrorNote what="Anlageplan" error={state.error} onRetry={() => void state.refetch()} />
      )}
      {state.data?.unavailable && (
        <p role="alert">
          Der gespeicherte Anlageplan ist nicht lesbar. Er wird nicht überschrieben.
        </p>
      )}
      {state.data && !state.data.unavailable && <FundingForm state={state.data} />}
    </details>
  );
}
function FundingForm({ state }: { state: FundingPlanState }) {
  const hidden = useAmountPrivacy();
  const securities = useQuery(instrumentsQuery());
  const positions = useQuery(portfolioPositionsQuery());
  const accounts = useQuery(accountsQuery());
  const savings = useQuery(savingsPlansQuery());
  const [draft, setDraft] = useState<{ form: Draft; revision: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [prepare, setPrepare] = useState<{ securityId: string; amountCents: number } | null>(null);
  const write = useBudgetWrite();
  const queryClient = useQueryClient();
  const form = draft?.form ?? draftOf(state.plan ?? fundingTemplate());
  const update = (change: (f: Draft) => Draft) =>
    setDraft({ form: change(form), revision: draft?.revision ?? state.revision });
  useBlocker({
    shouldBlockFn: () =>
      busy ||
      (draft !== null && !window.confirm('Ungespeicherte Änderungen am Anlageplan verwerfen?')),
    enableBeforeUnload: () => draft !== null || busy,
  });
  let plan: FundingPlan | undefined, result: ReturnType<typeof calculateFunding> | undefined;
  let error = '';
  try {
    plan = planOf(form);
    result = calculateFunding(plan);
  } catch (cause) {
    error =
      cause instanceof Error && !('issues' in cause)
        ? cause.message
        : 'Bitte Stufen, Zuordnungen und Gewichte prüfen. Jede Stufe muss genau 100 % ergeben.';
  }
  const save = async () => {
    if (!plan || !result || busy) return;
    setBusy(true);
    setNotice('');
    const saved = await write(
      () =>
        request<FundingPlanState & { groupId: string; changedCount: number }>(
          'PUT',
          '/api/portfolio/funding-plan',
          { revision: draft?.revision ?? state.revision, plan },
        ),
      () => 'Anlageplan gespeichert. Keine Buchung oder Bankorder ausgelöst.',
    );
    if (saved) setDraft(null);
    else
      setNotice(
        'Nicht gespeichert. Deine Eingaben bleiben erhalten. Bei einem Konflikt den gespeicherten Stand neu laden.',
      );
    setBusy(false);
  };
  const amountField = (
    label: string,
    key:
      | 'monthlyCents'
      | 'oneOffCents'
      | 'freeCashCents'
      | 'fixedFeeCents'
      | 'variableFeeBp'
      | 'maxFeeBp',
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          money
          inputMode="decimal"
          value={form[key]}
          aria-describedby={describedBy}
          onChange={(e) => update((f) => ({ ...f, [key]: e.target.value }))}
        />
      )}
    </Field>
  );
  const rowField = (i: number, label: string, key: 'valueCents' | 'priceCents') => (
    <Field label={label}>
      {({ id }) => (
        <TextInput
          id={id}
          money
          inputMode="decimal"
          value={form.rows[i]![key]}
          onChange={(e) =>
            update((f) => ({
              ...f,
              rows: f.rows.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)),
            }))
          }
        />
      )}
    </Field>
  );
  const loadValues = () => {
    if (!positions.data) return;
    const selected = form.rows.filter((r) => r.securityId);
    if (
      !securities.data ||
      securities.isFetching ||
      selected.some((r) => !securities.data.securities.some((s) => s.id === r.securityId))
    ) {
      setNotice(
        'Mindestens eine Instrumentzuordnung ist nicht verfügbar. Depotwerte wurden nicht übernommen.',
      );
      return;
    }
    if (!selected.length) {
      setNotice('Zuerst Instrumente zuordnen.');
      return;
    }
    const held = positions.data.positions;
    if (
      selected.some((r) => {
        const p = held.find((x) => x.securityId === r.securityId);
        return p && (p.valueCents === null || p.accounts.some((a) => a.valueStatus !== 'known'));
      })
    ) {
      setNotice(
        'Mindestens eine Bewertung fehlt oder ist geschätzt. Depotwerte wurden nicht übernommen.',
      );
      return;
    }
    update((f) => ({
      ...f,
      rows: f.rows.map((r) => ({
        ...r,
        valueCents: r.securityId
          ? decimal(held.find((p) => p.securityId === r.securityId)?.valueCents ?? 0)
          : r.valueCents,
      })),
    }));
    setNotice(
      `Marktwerte zum ${positions.data.asOf} übernommen, über alle Depots des zugeordneten Instruments. Übrige Anlagen und Verrechnungsgeld sind nicht enthalten. Kurse für den Kauf separat eingeben.`,
    );
  };
  return (
    <div className="funding-content">
      <h3>Dein Anlageplan</h3>
      <p>
        Bearbeitbare Vorlage für deine eigene Aufteilung. Gespeicherte Werte sind eine
        Momentaufnahme, keine Livekurse. Der Plan ändert weder Depotbestände noch die
        Anlageklassen-Ziele oder bestehende Sparpläne.
      </p>
      <fieldset disabled={busy}>
        <legend>1. Verfügbares Geld und monatliche Rate</legend>
        <div className="funding-fields">
          {amountField(
            'Monatliche Sparrate (€)',
            'monthlyCents',
            'Wird auch zum nächsten Kaufbudget addiert. Für eine reine Einmalanlage vorübergehend 0 setzen.',
          )}
          {amountField(
            'Einmalig neu investieren (€)',
            'oneOffCents',
            'Noch nicht investiertes Geld, z. B. vom Sparkonto. Nach dem Kauf auf 0 setzen.',
          )}
          {amountField(
            'Freies Verrechnungsgeld (€)',
            'freeCashCents',
            'Bereits verfügbares Bargeld. Jeden Betrag nur einmal erfassen; Notgroschen und Steuerreserve ausschließen.',
          )}
          <Field
            label="Gewählte Stufe"
            hint="Eine feste Stufe bleibt auch bei Kursrückgängen gewählt. Automatik gilt nur für diese Momentaufnahme, nicht für die bestehende Anlageklassen-Politik."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.stage ?? 'auto'}
                onChange={(e) =>
                  update((f) => ({
                    ...f,
                    stage: e.target.value === 'auto' ? null : Number(e.target.value),
                  }))
                }
              >
                <option value="auto">Automatisch nach Anlagevermögen inklusive Kaufbudget</option>
                {form.stages.map((s, i) => (
                  <option value={i} key={i}>
                    {maskMoneyText(`Stufe ${i + 1} – ab ${s.fromCents} €`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <details>
          <summary>Stufen und Zielgewichte bearbeiten</summary>
          {/* Keyboard focus is needed to scroll the wide table without a pointer. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="funding-scroll" role="region" aria-label="Zielgewichte" tabIndex={0}>
            <table className="funding-table">
              <caption>Zielgewichte in Prozent; jede Stufe muss 100 % ergeben</caption>
              <thead>
                <tr>
                  <th>Ab Anlagevermögen (€)</th>
                  {form.rows.map((r, i) => (
                    <th key={i}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.stages.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <TextInput
                        money
                        aria-label={`Stufe ${i + 1} ab Euro`}
                        inputMode="decimal"
                        value={s.fromCents}
                        onChange={(e) =>
                          update((f) => ({
                            ...f,
                            stages: f.stages.map((v, j) =>
                              j === i ? { ...v, fromCents: e.target.value } : v,
                            ),
                          }))
                        }
                      />
                    </td>
                    {s.weights.map((v, j) => (
                      <td key={j}>
                        <TextInput
                          aria-label={`Stufe ${i + 1} ${form.rows[j]!.name} Prozent`}
                          inputMode="decimal"
                          value={v}
                          onChange={(e) =>
                            update((f) => ({
                              ...f,
                              stages: f.stages.map((t, k) =>
                                k === i
                                  ? {
                                      ...t,
                                      weights: t.weights.map((w, n) =>
                                        n === j ? e.target.value : w,
                                      ),
                                    }
                                  : t,
                              ),
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <h4>2. Vorhandene Positionen und Kaufkurse</h4>
        <p>
          Aktuelle Marktwerte statt Einzahlungen eintragen. 0 bedeutet: noch nicht gehalten. Ein
          unbekannter Wert muss erst geklärt werden. Direktes Bitcoin ist ein eigener Baustein, ein
          Bitcoin-ETP wäre ein anderes Instrument.
        </p>
        <Button
          variant="ghost"
          onClick={loadValues}
          disabled={!positions.data || positions.isFetching}
        >
          Zugeordnete Depotwerte übernehmen
        </Button>
        <p className="vnote">
          {securities.isError
            ? 'Instrumente konnten nicht geladen werden. Bestehende Zuordnungen bleiben erhalten.'
            : 'Instrumente per Name und Kennung zuordnen. Fehlende Instrumente zuerst im Portfolio anlegen.'}
        </p>
        <div className="funding-rows">
          {form.rows.map((r, i) => (
            <fieldset key={i}>
              <legend>{r.name}</legend>
              <Field label={`${r.name}: Instrument`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={r.securityId ?? ''}
                    onChange={(e) =>
                      update((f) => ({
                        ...f,
                        rows: f.rows.map((v, j) =>
                          i === j ? { ...v, securityId: e.target.value || null } : v,
                        ),
                      }))
                    }
                  >
                    <option value="">Noch nicht zugeordnet</option>
                    {r.securityId &&
                      !securities.data?.securities.some((s) => s.id === r.securityId) && (
                        <option value={r.securityId}>Gespeicherte Zuordnung nicht verfügbar</option>
                      )}
                    {securities.data?.securities.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.isin ? ` · ${s.isin}` : s.symbol ? ` · ${s.symbol}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {rowField(i, `${r.name}: Marktwert (€)`, 'valueCents')}
              {rowField(i, `${r.name}: EUR-Briefkurs je Stück`, 'priceCents')}
              <label className="funding-check">
                <input
                  type="checkbox"
                  checked={r.fractional}
                  onChange={(e) =>
                    update((f) => ({
                      ...f,
                      rows: f.rows.map((v, j) =>
                        i === j ? { ...v, fractional: e.target.checked } : v,
                      ),
                    }))
                  }
                />
                Bruchstücke beim Anbieter möglich
              </label>
            </fieldset>
          ))}
        </div>
        <details>
          <summary>Orderkosten und Gebührenlimit</summary>
          <div className="funding-fields">
            {amountField('Fixgebühr je Kauf (€)', 'fixedFeeCents')}
            {amountField('Variable Kaufgebühr (%)', 'variableFeeBp')}
            {amountField('Maximale Gebühr / Kaufwert (%)', 'maxFeeBp')}
          </div>
          <p>
            Gebühren gelten für alle Positionen. Tatsächliche Konditionen eintragen; 0 ist keine
            Bestätigung kostenloser Ausführung. Verkaufssteuern, Spreads und laufende Produktkosten
            werden hier nicht berechnet.
          </p>
        </details>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <section aria-labelledby="funding-result-title">
          <h4 id="funding-result-title">3. Sparraten und nächste Käufe</h4>
          <p>
            Stufe {result.stage + 1} · Anlagevermögen {eur(result.wealthCents)} · Kaufbudget{' '}
            {eur(result.budgetCents)}
          </p>
          <p>
            Die normale Monatsrate gilt bei passenden Gewichten. Das nächste Kaufbudget gleicht
            Untergewichte aus; Übergewichte führen zu keinem Verkauf.
          </p>
          <p className="funding-table-hint">
            Auf kleinen Bildschirmen die Tabelle seitlich verschieben.
          </p>
          {/* Keyboard focus is needed to scroll the wide table without a pointer. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="funding-scroll" role="region" aria-label="Kaufaufteilung" tabIndex={0}>
            <table className="funding-table">
              <caption>Aufteilung deines Anlageplans</caption>
              <thead>
                <tr>
                  <th>Baustein / Ziel</th>
                  <th>Monatsrate</th>
                  <th>Nächstes Budget</th>
                  <th>Stück / Kaufwert</th>
                  <th>Status / Sparplan</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {form.rows[i]!.name}
                      <small>{decimal(r.targetBp)} %</small>
                    </th>
                    <td>{eur(r.monthlyCents)}</td>
                    <td>{eur(r.budgetCents)}</td>
                    <td>
                      {hidden
                        ? '•••'
                        : (r.unitsE8 / 1e8).toLocaleString('de-AT', { maximumFractionDigits: 8 })}
                      <small>
                        {eur(r.buyCents)} + {eur(r.feeCents)} Gebühr
                      </small>
                    </td>
                    <td>
                      {r.status}
                      {r.overweightCents > 0 && <small>Übergewicht {eur(r.overweightCents)}</small>}
                      {form.rows[i]!.securityId &&
                        r.monthlyCents > 0 &&
                        (savings.data?.plans.some(
                          (p) => p.securityId === form.rows[i]!.securityId && p.validTo === null,
                        ) ? (
                          <small>Bestehenden Sparplan oben öffnen und Rate prüfen.</small>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              !accounts.data ||
                              !savings.data ||
                              !securities.data?.securities.some(
                                (s) => s.id === form.rows[i]!.securityId,
                              )
                            }
                            onClick={() =>
                              setPrepare({
                                securityId: form.rows[i]!.securityId!,
                                amountCents: r.monthlyCents,
                              })
                            }
                          >
                            Sparplan vorbereiten
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Käufe {eur(result.buysCents)} + Gebühren {eur(result.feesCents)} + Restgeld{' '}
            {eur(result.remainingCents)} = Kaufbudget {eur(result.budgetCents)}.
          </p>
          <p>
            Nach ausgeführten Käufen Depotwerte aktualisieren, Einmalbetrag auf 0 setzen und
            Restgeld einmalig als freies Verrechnungsgeld übernehmen. Kleine Beträge bei Bedarf
            ansparen. Bruchstück- und Sparplanverfügbarkeit beim Anbieter prüfen.
          </p>
        </section>
      )}
      <div className="savings-actions">
        <Button disabled={!result || busy || state.unavailable} onClick={() => void save()}>
          Anlageplan speichern
        </Button>
        {draft && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const current = await queryClient.fetchQuery({ ...fundingQuery(), staleTime: 0 });
                  if (current.unavailable) throw new Error('unavailable');
                  setDraft(null);
                  setNotice('Gespeicherten Stand geladen.');
                } catch {
                  setNotice(
                    'Aktueller Stand konnte nicht geladen werden. Deine Eingaben bleiben erhalten.',
                  );
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Änderungen verwerfen / gespeicherten Stand laden
          </Button>
        )}
      </div>
      <p className="vnote">
        Speichern bewahrt nur diesen Plan. Sparpläne werden einzeln bestätigt; Bankaufträge richtest
        du beim Anbieter ein. Die Gewichte sind keine Aussage über künftige Rendite oder
        Verlustgrenzen.
      </p>
      {prepare && accounts.data && securities.data && savings.data && (
        <SavingsPanel
          id="neu"
          plans={savings.data.plans}
          accounts={accounts.data.accounts.filter((a) => a.currency === 'EUR')}
          securities={securities.data.securities}
          today={accounts.data.asOf}
          initialFunding={prepare}
          onClose={() => setPrepare(null)}
        />
      )}
    </div>
  );
}
