import { Button, Field, Select, TextInput, useAmountPrivacy, privateAmount } from '@budget/ui';
import {
  STRATEGY_CATEGORIES, STRATEGY_TARGETS, cents, formatDecimal, parseAmount, parseScaledDecimal,
  strategyConfigurationSchema, type StrategyCategory, type StrategyConfiguration,
} from '@budget/domain';
import type { PortfolioStrategyView } from '@budget/db';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { VERMOEGEN_PORTFOLIO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationHint, ValuationSourceHint, type WithValuationNotes } from '../ledger/valuation-hint';
import { ApiError } from '../api/http';
import { strategyQuery, saveStrategy, saveStrategyDecision } from './strategy-api';
import { unitsText } from './portfolio-format';
import './strategy.css';

const NAMES: Record<StrategyCategory, string> = {
  global: 'Globale Aktien', gold: 'Gold · ungehebelt', nasdaq2x: 'Nasdaq-100 · täglich 2×', eurBonds: 'Kurzlaufende EUR-Staatsanleihen',
};
const TREND = { strong: 'Stark', mixed: 'Gemischt', weak: 'Schwach' };
const percent = (bp: number) => privateAmount(`${(bp / 100).toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`);
const DIAGNOSTICS: Record<string, string> = {
  configuration_missing: 'Ordne zuerst die bestehenden Anlageklassen und Kaufprodukte zu.',
  configuration_no_longer_matches_exposure: 'Die gespeicherte Zuordnung passt nicht mehr zu den aktuellen Anlageklassen oder Produkten.',
  strategy_disabled: 'Die optionale Strategie ist ausgeschaltet.',
  contribution_missing: 'Die monatliche Rate ist noch nicht festgelegt.',
  binding_decision_unavailable: 'Es gibt noch keine passende verbindliche Monatsentscheidung. Es wird kein Trend angenommen.',
  negative_portfolio: 'Eine negative Anlagebasis lässt hier keine Kauf- oder Rebalancing-Beträge zu.',
  scope_value_mismatch: 'Die Bestandssumme stimmt nicht mit der vollständigen Anlagebasis überein. Kaufbeträge bleiben offen.',
  cash_unavailable: 'Das saldierte Anlageguthaben ist ohne vollständige Währungsbewertung offen.',
  valuation_incomplete_or_provisional: 'Die Bewertung ist unvollständig, geschätzt oder veraltet. Kaufbeträge bleiben offen.',
};
const PURCHASE_REASON = { allocated: 'Untergewicht verringern', no_deficit: 'Kein zugeteilter Fehlbetrag',
  constraints_unknown: 'Gebühren oder Kaufgrenzen fehlen', price_unavailable: 'Ein verlässlicher Stückpreis fehlt',
  below_minimum: 'Betrag reicht nicht für Mindestkauf oder Stückelung' };

export function PortfolioStrategyPage() {
  useAmountPrivacy();
  const query = useQuery(strategyQuery());
  const [editing, setEditing] = useState(false);
  const authError = query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 403);
  const data = authError ? undefined : query.data;
  return <PageFrame meta={VERMOEGEN_PORTFOLIO_META} title="Trendstrategie">
    <nav className="strategy-breadcrumb" aria-label="Brotkrumen"><AppLink to="/vermoegen/portfolio">Portfolio</AppLink> › <span aria-current="page">Trendstrategie</span></nav>
    {query.isPending && <LoadingNote what="Strategievorschau" />}
    {query.isError && <ErrorNote what="Strategievorschau" error={query.error} onRetry={() => void query.refetch()} />}
    {data && <div className="strategy-page">
      <div className="strategy-actions">
        <Button variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching}>Aktualisieren</Button>
        <Button variant="ghost" onClick={() => setEditing((open) => !open)}>{editing ? 'Einstellungen schließen' : 'Strategie einstellen'}</Button>
      </div>
      <p className="strategy-stand">{query.isError || query.isFetching ? 'Zuletzt geladener Stand' : 'Stand'} · <time dateTime={data.asOf}>{new Date(data.asOf).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</time></p>
      {editing && <StrategySettings data={data} fresh={query.isSuccess && !query.isFetching}
        onSaved={() => setEditing(false)} />}
      <StrategyPreview data={data} fresh={query.isSuccess && !query.isFetching && navigator.onLine} />
    </div>}
  </PageFrame>;
}
function StrategyPreview({ data, fresh }: { data: PortfolioStrategyView & WithValuationNotes; fresh: boolean }) {
  const write = useBudgetWrite();
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const contribution = data.contribution, candidate = data.monthlyCandidate;
  const daily = data.dailyPreview;
  const record = async () => {
    if (!fresh || !candidate?.canRecord || saving.current) return;
    saving.current = true; setBusy(true);
    try { await write(() => saveStrategyDecision(candidate.month, data.revision, candidate.decisionRevision),
      (result) => result.changedCount ? 'Verbindliche Monatsentscheidung gespeichert.' : 'Diese Monatsentscheidung ist bereits gespeichert.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <>
    <section aria-labelledby="strategy-next-title">
      <h2 id="strategy-next-title">Dein nächster Sparplan: {longDay(data.nextContribution.nominalDate)} – {data.config?.contributionCents === null || !data.config ? 'Rate offen' : eur(data.config.contributionCents)}</h2>
      <p>{data.nextContribution.executionDate
        ? `Ausführungstag laut hinterlegtem Kalender: ${longDay(data.nextContribution.executionDate)}.`
        : 'Der 15. ist der Planungstermin. Ohne verifizierten Ausführungskalender ist ein tatsächlicher oder verschobener Ausführungstag offen.'}
        {data.nextContribution.provisional && ' Die Vorschau ist vorläufig.'}</p>
      <dl className="strategy-facts">
        <div><dt>Verbindlicher Trend</dt><dd>{data.binding ? `${TREND[data.binding.trend]} · gültig ab ${longDay(data.binding.effectiveDate)}` : 'Nicht verfügbar'}</dd></div>
        <div><dt>Tägliche Trendvorschau</dt><dd>{daily.status === 'available' ? `${TREND[daily.trend]} · Schluss ${longDay(daily.sessionDate)}` : 'Nicht verfügbar · verifizierte Index- und US-Handelsdaten erforderlich'}</dd></div>
        <div><dt>Nächste verbindliche Entscheidung</dt><dd>{data.nextDecision ? `${longDay(data.nextDecision.signalDate)} · gültig ab ${longDay(data.nextDecision.effectiveDate)}` : 'Ohne vollständigen US-Handelskalender offen'}</dd></div>
        <div><dt>Portfoliowert</dt><dd>{data.valuation.valueCents === null ? 'Nicht vollständig bewertbar' : `${data.valuation.quality.valuationQuality === 'exact' ? '' : '≈ '}${eur(data.valuation.valueCents)}`}</dd></div>
        <div><dt>Nicht investiertes Guthaben · saldiert</dt><dd>{data.valuation.cashCents === null ? 'Nicht vollständig bewertbar' : eur(data.valuation.cashCents)}<small>{data.config?.includeFreeCash ? 'Die Vorschau darf positives Guthaben zusätzlich berücksichtigen.' : 'Die Vorschau verwendet nur die monatliche Rate.'}</small></dd></div>
      </dl>
      <ValuationHint {...data} />
      <ValuationSourceHint sources={data.valuation.sources} label="Strategieportfolio · Bewertungsstand" />
      {data.binding && <details><summary>Verbindliche Signalgrundlage</summary><p>Entscheidung gespeichert am {new Date(data.binding.knownAt).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })} · Schluss {longDay(data.binding.signalDate)} · Quelle {data.binding.sourceId} · Index {data.binding.indexId} · US-Kalender {data.binding.calendarId} ({data.binding.calendarSourceId}).</p></details>}
      {data.provider && <p className="strategy-stand">Signalquelle {data.provider.source.sourceId} · Index {data.provider.source.indexId} · USD-Kursindex, ungehebelt · US-Kalender {data.provider.calendarId}</p>}
      {daily.status === 'available' && <p className="strategy-stand">Signalabruf <time dateTime={daily.asOf}>{new Date(daily.asOf).toLocaleString('de-AT')}</time> · Kursbeobachtung <time dateTime={daily.latestClose.observedAt}>{new Date(daily.latestClose.observedAt).toLocaleString('de-AT')}</time>. Die Tagesvorschau ändert keine verbindlichen Ziele.</p>}
      {daily.status === 'unavailable' && <p className="strategy-stand">
        {daily.reason === 'trusted_provider_unconfigured' ? 'Die verlässliche Quelle für USD-Kursindex und US-Handelskalender ist noch nicht angeschlossen.'
          : daily.reason === 'insufficient-history' ? 'Weniger als 220 vollständige abgeschlossene US-Handelstage liegen vor.'
            : daily.reason === 'missing-close' ? 'In der benötigten Kursreihe fehlen Schlusskurse.' : 'Die vorliegenden Signalgrundlagen sind nicht vollständig oder nicht passend.'}
        {'missingSessions' in daily && daily.missingSessions.length > 0 && <> Fehlende Tage: {daily.missingSessions.slice(0, 5).map(longDay).join(', ')}{daily.missingSessions.length > 5 ? ' …' : ''}.</>}
      </p>}
      <p className="strategy-stand">Die Trendregel vergleicht den letzten abgeschlossenen Schlusskurs mit dem 200-Tage-Durchschnitt und diesen mit dem Durchschnitt 20 US-Handelstage zuvor. Verwendet wird der ungehebelte USD-Kursindex.</p>
      {candidate && <p>Monatssignal: Schluss {longDay(candidate.signalDate)} · wirksam ab {longDay(candidate.effectiveDate)}. {candidate.signal.status === 'available' ? TREND[candidate.signal.trend] : 'Noch nicht verlässlich bestimmbar.'}</p>}
      {candidate?.canRecord && <Button disabled={!fresh || busy || !data.config?.enabled} onClick={() => void record()}>Verbindliche Monatsentscheidung speichern</Button>}
    </section>
    {data.diagnostics.length > 0 && <section aria-labelledby="strategy-open-title"><h2 id="strategy-open-title">Für Kaufbeträge noch offen</h2>
      <ul>{[...new Set(data.diagnostics.map((reason) => DIAGNOSTICS[reason] ?? (reason.startsWith('incompatible:')
        ? 'Ein vorhandenes Produkt entspricht nicht dem Hebel seiner Strategiekategorie.'
        : 'Ein vorhandener Bestand ist keiner passenden Strategiekategorie zugeordnet.')))].map((reason) => <li key={reason}>{reason}</li>)}</ul>
    </section>}
    <section aria-labelledby="strategy-purchases-title"><h2 id="strategy-purchases-title">Käufe aus der monatlichen Rate</h2>
      <p>Alle enthaltenen Bestände zählen zum Istwert, auch nicht mehr besparte Produkte. Kaufgewichte ändern keine wirtschaftliche Anlageklassenzuordnung.</p>
      <div className="strategy-table-scroll" role="region" aria-label="Strategieaufteilung" tabIndex={0}>
        <table className="ktable"><caption>Aktuelle EUR-Werte und verbindliche Zielgewichte</caption><thead><tr>
          <th scope="col">Kategorie</th><th scope="col">Istwert</th><th scope="col">Istgewicht</th><th scope="col">Ziel</th><th scope="col">Abweichung</th><th scope="col">Geplanter Kauf</th>
        </tr></thead><tbody>{STRATEGY_CATEGORIES.map((category) => {
          const row = contribution?.rows.find((entry) => entry.category === category);
          const valuation = data.valuation.categoryValues.find((entry) => entry.category === category)!;
          const weight = valuation.weightBp;
          const target = data.binding ? STRATEGY_TARGETS[data.binding.trend][category] : null;
          return <tr key={category}><th scope="row"><details><summary>{NAMES[category]}</summary>
            <ul>{[...new Set([...valuation.holdings.map((holding) => holding.securityId),
              ...(data.config?.routes.filter((route) => route.category === category).map((route) => route.securityId) ?? [])])].map((id) => {
              const route = data.config?.routes.find((entry) => entry.securityId === id);
              const holding = valuation.holdings.find((entry) => entry.securityId === id);
              const purchase = row?.purchases.find((entry) => entry.securityId === id);
              return <li key={id}>{data.metadata.securities.find((security) => security.id === id)?.name ?? 'Nicht verfügbares Produkt'}
                {' · '}Bestand {holding ? holding.valueCents === null ? 'nicht vollständig bewertbar' : eur(holding.valueCents) : valuation.valueCents === null ? 'nicht vollständig bewertbar' : eur(0)}
                {route ? <> · Kaufgewicht {percent(route.weightBp)}</> : ' · keine neuen Käufe vorgesehen'}
                {purchase && <> · {eur(purchase.grossCents)} + {eur(purchase.feeCents)} Gebühren · {PURCHASE_REASON[purchase.reason]}{purchase.quoteDate && <> · Kursstand {longDay(purchase.quoteDate)} ({purchase.quoteCurrency})</>}{purchase.unitsE8 !== null && <> · {privateAmount(unitsText(purchase.unitsE8))} Anteile</>}</>}
              </li>;
            })}</ul></details></th>
            <td>{valuation.valueCents === null ? 'Nicht vollständig bewertbar' : eur(valuation.valueCents)}</td><td>{weight === null ? '–' : percent(weight)}</td><td>{target === null ? '–' : percent(target)}</td>
            <td>{weight === null || target === null ? '–' : percent(weight - target)}</td>
            <td>{row ? <>{eur(row.grossCents)}<small>Zielbetrag vor Kosten {eur(row.idealCents)} · {row.idealCents > 0 ? 'Untergewicht erhält einen Anteil der Einzahlung.' : 'Kein Betrag zugeteilt; vorhandene Bestände bleiben erhalten.'}</small></> : 'Nicht verfügbar'}</td></tr>;
        })}</tbody></table>
      </div>
      {contribution && <p className="strategy-identity">Finanzierung {eur(contribution.fundingCents)} = Käufe {eur(contribution.grossCents)} + Gebühren {eur(contribution.feeCents)} + verbleibendes Guthaben {eur(contribution.residualCents)}.
        {contribution.cashAddedCents > 0 && ` Davon ${eur(contribution.cashAddedCents)} aus ausdrücklich einbezogenem Guthaben.`}
        {!contribution.executable && ' Fehlende Kaufgrenzen oder Stückpreise machen daraus keinen ausführbaren Kaufvorschlag.'}</p>}
    </section>
    <section aria-labelledby="strategy-rebalance-title"><h2 id="strategy-rebalance-title">Rebalancing · getrennt von der Sparrate</h2>
      {data.rebalance ? data.rebalance.due ? <>
        <p>{data.rebalance.trigger === 'regime_changed' ? 'Monatlicher Trendwechsel' : 'Quartalsende'} · wirksam ab {longDay(data.rebalance.effectiveDate)}. Das sind Brutto-Zielbeträge für das ganze Portfolio.</p>
        <ul>{data.rebalance.rows.map((row) => <li key={row.category}>{NAMES[row.category]} · Verkauf {eur(row.sellCents)} · Kauf {eur(row.buyCents)}</li>)}</ul>
        <p>Vor einer Ausführung sind konkrete Verkaufsprodukte, Gebühren, Stückelung und mögliche österreichische Steuerfolgen getrennt zu prüfen. Hier werden keine Steuerbeträge angenommen.</p>
      </> : <p>Ohne monatlichen Trendwechsel ist zwischen Quartalsenden kein vollständiges Rebalancing vorgesehen.</p>
        : <p>Ohne passenden verbindlichen Trend und vollständige Bewertung bleibt ein Rebalancing-Vorschlag offen.</p>}
    </section>
    <p>Diese Ansicht erzeugt Vorschläge und speichert nur ausdrücklich bestätigte Strategieeinstellungen oder Monatsentscheidungen. Tatsächliche Ausführungen gehören weiterhin in die bestehende Trade-Erfassung.</p>
    <AppLink to="/vermoegen/portfolio">Zum Portfolio und zur Trade-Erfassung</AppLink>
  </>;
}

type RouteDraft = { category: StrategyCategory; securityId: string; weight: string; daily2xNasdaqConfirmed: boolean;
  limits: boolean; minimum: string; fee: string; feePercent: string; amountBased: boolean; step: string };
const numberText = (value: number) => formatDecimal(cents(value));
function StrategySettings({ data, fresh, onSaved }: { data: PortfolioStrategyView; fresh: boolean; onSaved: () => void }) {
  const [revision] = useState(data.revision);
  const [enabled, setEnabled] = useState(data.config?.enabled ?? false);
  const [amount, setAmount] = useState(data.config?.contributionCents == null ? '' : numberText(data.config.contributionCents));
  const [cash, setCash] = useState(data.config?.includeFreeCash ?? false);
  const [classes, setClasses] = useState<StrategyConfiguration['classes']>(data.config?.classes ?? { global: '', gold: '', nasdaq2x: '', eurBonds: '' });
  const [routes, setRoutes] = useState<RouteDraft[]>((data.config?.routes ?? []).map((route) => ({
    category: route.category, securityId: route.securityId, weight: numberText(route.weightBp), daily2xNasdaqConfirmed: route.daily2xNasdaqConfirmed,
    limits: route.constraints !== null, minimum: route.constraints ? numberText(route.constraints.minimumGrossCents) : '',
    fee: route.constraints ? numberText(route.constraints.fixedFeeCents) : '', feePercent: route.constraints ? numberText(route.constraints.feeBp) : '',
    amountBased: route.constraints?.unitStepE8 === null, step: route.constraints?.unitStepE8 ? unitsText(route.constraints.unitStepE8).replaceAll('.', '') : '',
  })));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const saving = useRef(false), write = useBudgetWrite();
  const patchRoute = (index: number, patch: Partial<RouteDraft>) => setRoutes((current) => current.map((route, at) => at === index ? { ...route, ...patch } : route));
  const value = (text: string) => { const parsed = parseAmount(text); if (!text.trim() || !parsed.ok || parsed.cents < 0) throw new RangeError(); return parsed.cents; };
  const unitStep = (text: string) => { const raw = text.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,8})?$/.test(raw)) throw new RangeError();
    return parseScaledDecimal(raw, 8); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving.current || !fresh || revision !== data.revision) return;
    setError(''); let config: StrategyConfiguration;
    try { config = strategyConfigurationSchema.parse({ version: 1, enabled, contributionCents: amount.trim() ? value(amount) : null,
      includeFreeCash: cash, classes, routes: routes.map((route) => ({ category: route.category, securityId: route.securityId,
        weightBp: value(route.weight), daily2xNasdaqConfirmed: route.daily2xNasdaqConfirmed,
        constraints: !route.limits ? null : { minimumGrossCents: value(route.minimum), fixedFeeCents: value(route.fee), feeBp: value(route.feePercent),
          unitStepE8: route.amountBased ? null : unitStep(route.step) } })) }); }
    catch { setError('Bitte Anlageklassen, Kaufprodukte, Gewichte und eingeschaltete Kaufgrenzen vollständig und gültig angeben. Die Kaufgewichte jeder Kategorie müssen zusammen 100 % ergeben.'); return; }
    saving.current = true; setBusy(true);
    try { if (await write(() => saveStrategy(config, revision), () => 'Strategieeinstellungen gespeichert.')) onSaved(); }
    finally { saving.current = false; setBusy(false); }
  };
  return <form className="strategy-settings" onSubmit={(event) => void save(event)} aria-busy={busy}>
    <h2>Optionale Trendstrategie einstellen</h2>
    <p>Wähle vorhandene Anlageklassen. Ihre bisherigen Zielversionen und deine Sparpläne bleiben eigenständig. Einander überschneidende globale Fonds bedeuten nicht automatisch zusätzliche Diversifikation.</p>
    <fieldset disabled={busy}><legend>Rate und Guthaben</legend>
      <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} /> Strategie ausdrücklich aktivieren</label>
      <Field label="Monatliche Rate in EUR">{({ id, describedBy, invalid }) =>
        <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} money inputMode="decimal" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} />}
      </Field>
      <label><input type="checkbox" checked={cash} onChange={(event) => setCash(event.currentTarget.checked)} /> Positives saldiertes Anlageguthaben zusätzlich zur Rate einbeziehen</label>
    </fieldset>
    {STRATEGY_CATEGORIES.map((category) => <fieldset disabled={busy} key={category}><legend>{NAMES[category]}</legend>
      <Field label="Bestehende Anlageklasse">{({ id, describedBy, invalid }) =>
        <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={classes[category]} onChange={(event) => setClasses((current) => ({ ...current, [category]: event.currentTarget.value }))}>
          <option value="">Bitte auswählen</option>{data.metadata.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </Select>}
      </Field>
      {routes.map((route, index) => route.category !== category ? null : <div className="strategy-route" key={index}>
        <Field label="Produkt für neue Käufe">{({ id, describedBy, invalid }) =>
          <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={route.securityId} onChange={(event) => patchRoute(index, { securityId: event.currentTarget.value })}>
            <option value="">Bitte auswählen</option>{data.metadata.securities.filter((row) => row.leverageFactor === (category === 'nasdaq2x' ? 20 : 10) && row.exposure?.complete && row.exposure.weights.some((weight) => weight.assetClassId === classes[category] && weight.weightBp === 10000))
              .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </Select>}
        </Field>
        <Field label="Internes Kaufziel in %">{({ id, describedBy, invalid }) =>
          <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} inputMode="decimal" value={route.weight} onChange={(event) => patchRoute(index, { weight: event.currentTarget.value })} />}
        </Field>
        {category === 'nasdaq2x' && <label><input type="checkbox" checked={route.daily2xNasdaqConfirmed} onChange={(event) => patchRoute(index, { daily2xNasdaqConfirmed: event.currentTarget.checked })} /> Dieses gewählte Produkt bildet den Nasdaq-100 mit täglichem Zweifachhebel ab.</label>}
        <label><input type="checkbox" checked={route.limits} onChange={(event) => patchRoute(index, { limits: event.currentTarget.checked })} /> Gebühren und Kaufgrenzen ausdrücklich hinterlegen</label>
        {route.limits && <div className="strategy-costs">
          <Field label="Mindestkauf ohne Gebühren in EUR">{({ id, describedBy, invalid }) =>
            <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} money inputMode="decimal" value={route.minimum} onChange={(event) => patchRoute(index, { minimum: event.currentTarget.value })} />}
          </Field>
          <Field label="Fixe Kaufgebühr in EUR">{({ id, describedBy, invalid }) =>
            <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} money inputMode="decimal" value={route.fee} onChange={(event) => patchRoute(index, { fee: event.currentTarget.value })} />}
          </Field>
          <Field label="Variable Kaufgebühr in %">{({ id, describedBy, invalid }) =>
            <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} inputMode="decimal" value={route.feePercent} onChange={(event) => patchRoute(index, { feePercent: event.currentTarget.value })} />}
          </Field>
          <label><input type="checkbox" checked={route.amountBased} onChange={(event) => patchRoute(index, { amountBased: event.currentTarget.checked })} /> Betragskäufe mit Bruchstücken sind möglich</label>
          {!route.amountBased && <Field label="Stückelung in Anteilen, z. B. 1 für ganze Stücke">{({ id, describedBy, invalid }) =>
            <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} inputMode="decimal" value={route.step} onChange={(event) => patchRoute(index, { step: event.currentTarget.value })} />}
          </Field>}
        </div>}
        <Button type="button" variant="ghost" onClick={() => setRoutes((current) => current.filter((_, at) => at !== index))}>Kaufprodukt entfernen</Button>
      </div>)}
      <Button type="button" variant="ghost" onClick={() => setRoutes((current) => [...current, { category, securityId: '', weight: '', daily2xNasdaqConfirmed: false,
        limits: false, minimum: '', fee: '', feePercent: '', amountBased: false, step: '' }])}>Kaufprodukt ergänzen</Button>
    </fieldset>)}
    {revision !== data.revision && <p role="alert">Die Einstellungen wurden inzwischen geändert. Schließe den Entwurf und öffne den aktuellen Stand erneut.</p>}
    {error && <p role="alert">{error}</p>}
    <Button type="submit" disabled={busy || !fresh || revision !== data.revision}>Einstellungen speichern</Button>
  </form>;
}
