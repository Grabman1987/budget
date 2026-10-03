import { useAmountPrivacy, privateAmount, Button, Field, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { lastDayOfMonth, parseAmount, formatDecimal } from '@budget/domain';
import { VERMOEGEN_FREIHEIT_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { freedomQuery, type FreedomView } from './freedom-api';
import { freedomScenario, monthText, percent } from './freedom-model';
import { FreedomChart } from './freedom-chart';
import './freedom.css';

export function FreedomPage() {
  useAmountPrivacy();
  const query = useQuery(freedomQuery());
  return (
    <PageFrame meta={VERMOEGEN_FREIHEIT_META} revealCurrentRegister>
      <div className="kview vview freedom-view">
        {query.isPending && <LoadingNote what="Freiheitszahl" />}
        {query.isError && (
          <ErrorNote
            what="Freiheitszahl"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && <FreedomContent view={query.data} />}
      </div>
    </PageFrame>
  );
}

function FreedomContent({ view }: { view: FreedomView }) {
  const hidden = useAmountPrivacy();
  const [saving, setSaving] = useState('');
  const [returnBp, setReturnBp] = useState(view.defaultRealReturnBp);
  const { projection, error } = freedomScenario(view, saving, returnBp);
  const commitSaving = () => {
    const parsed = parseAmount(saving);
    if (parsed.ok && parsed.cents >= 0) setSaving(formatDecimal(parsed.cents));
  };
  const reason = view.expensesUnsafe
    ? 'Die Ausgabenbasis überschreitet den sicheren Rechenbereich.'
    : !view.months.length
      ? 'Noch keine abgeschlossenen Budgetmonate. Die Ausgabenbasis fehlt.'
      : view.targetCents !== null && view.targetCents <= 0
        ? 'Die erfassten Nettoausgaben ergeben kein positives Ziel. Daraus lässt sich keine Freiheitszahl ableiten.'
        : view.investedCents === null
          ? view.accounts.every((a) => a.valueCents !== null)
            ? 'Die Summe des investierten Vermögens überschreitet den sicheren Rechenbereich.'
            : 'Investiertes Vermögen nicht vollständig bewertbar. Einzelne Bewertungen fehlen oder überschreiten den sicheren Rechenbereich; die Gründe stehen bei den Quellkonten.'
          : view.progressBp === null
            ? 'Der Fortschritt überschreitet den sicheren Rechenbereich.'
            : '';
  return (
    <>
      <section className="vnw" aria-labelledby="freedom-title">
        <div className="tbd-head">
          <h2 id="freedom-title">Freiheitszahl</h2>
          <span className="tbd-state ink">R16 · Ziel 100 %</span>
        </div>
        <div className="tbd-fig" data-testid="freedom-figure">
          {view.progressBp === null ? '—' : percent(view.progressBp)}
          <span className="cents"> %</span>
        </div>
        <div className="chain-inline" role="group" aria-label="Maßkette Freiheitszahl">
          <span className="ct-pair">
            <a className="ct-term" href="#freedom-accounts">
              <span className="ct-label tech">Investiert</span>
              <span className="ct-val">
                {view.investedCents === null ? 'unbekannt' : eur(view.investedCents)}
              </span>
            </a>
          </span>
          <span className="ct-pair">
            <span className="ct-op" aria-hidden="true">
              ÷
            </span>
            <a className="ct-term" href="#freedom-expenses">
              <span className="ct-label tech">{view.multiple} Jahresausgaben</span>
              <span className="ct-val">
                {view.targetCents === null ? 'unbekannt' : eur(view.targetCents)}
              </span>
            </a>
          </span>
          <span className="ct-pair">
            <span className="ct-op" aria-hidden="true">
              =
            </span>
            <span className="ct-term is-result">
              <span className="ct-label tech">Freiheitszahl</span>
              <span className="ct-val">
                {view.progressBp === null ? '—' : `${percent(view.progressBp)} %`}
              </span>
            </span>
          </span>
        </div>
        {view.progressBp !== null && (
          <div className="vprog" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, view.progressBp / 100))}%` }} />
            {[25, 50, 75].map((p) => (
              <span key={p} style={{ left: `${p}%` }} />
            ))}
          </div>
        )}
        {reason && (
          <p className="vnote" role="status">
            {reason}
          </p>
        )}
        <p className="vnote" data-testid="freedom-annual-spend">
          {view.annualSpendCents === null
            ? 'Jahresausgaben unbekannt'
            : `${eur(view.annualSpendCents)} Jahresausgaben`}{' '}
          · Bedarf und Wunsch, ohne Zukunft.{' '}
          {view.multiple === 25
            ? 'Bei 100 % entsprechen 4 % Entnahme im Jahr dieser Ausgabenbasis.'
            : `Ziel laut R16: ${view.multiple} Jahresausgaben.`}
        </p>
        <p className="vnote">
          Bewertung am {longDay(view.asOf)}. Ausgaben bis {monthText(view.refMonth)}.
          {view.months.length > 0 &&
            view.months.length < 12 &&
            ` Erst ${view.months.length} abgeschlossene Monate: ihr Durchschnitt wurde auf zwölf Monate hochgerechnet.`}
        </p>
      </section>
      <section className="vcomp" aria-labelledby="freedom-assumptions">
        <div className="tbd-head">
          <h2 id="freedom-assumptions">Annahmen</h2>
        </div>
        <Field
          label="Sparrate pro Monat"
          hint="Ungespeicherte Annahme in Euro. Rechnen erlaubt, z. B. 400+300. Enter übernimmt."
          error={error || undefined}
        >
          {({ id, describedBy, invalid }) => (
            <div className="amount-field amount-field-sm">
              <input
                type={hidden ? 'password' : 'text'}
                id={id}
                className="amount-input"
                inputMode="decimal"
                autoComplete="off"
                value={saving}
                onChange={(e) => setSaving(e.target.value)}
                onBlur={commitSaving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitSaving();
                  }
                }}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
              <span className="amount-cur" aria-hidden="true">
                €
              </span>
            </div>
          )}
        </Field>
        <Field label="Rendite nach Inflation">
          {({ id }) => (
            <Select
              id={id}
              value={String(returnBp)}
              onChange={(e) => setReturnBp(Number(e.target.value))}
            >
              {[0, 300, 400, 500, 600].map((bp) => (
                <option key={bp} value={bp}>
                  {bp / 100} % p. a.
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="kv">
          <span>Ziel erreicht</span>
          <strong data-testid="freedom-done">
            {projection
              ? projection.doneMonth
                ? monthText(projection.doneMonth)
                : 'Nicht innerhalb von 60 Jahren'
              : '—'}
          </strong>
        </div>
        {projection && (
          <>
            <div className="kv">
              <span>in</span>
              <strong>
                {projection.months === null ? 'mehr als 60 Jahren' : `${projection.months} Monaten`}
              </strong>
            </div>
            <div className="kv">
              <span>{privateAmount('+100')} € Sparrate pro Monat</span>
              <strong>
                {projection.monthsEarlier !== null
                  ? `${projection.monthsEarlier} Monate früher`
                  : projection.monthsWithExtra !== null
                    ? `Ziel in ${projection.monthsWithExtra} Monaten`
                    : 'Nicht innerhalb von 60 Jahren'}
              </strong>
            </div>
          </>
        )}
        {!saving.trim() && (
          <p className="vnote">
            Gib deine angenommene Sparrate ein, um ab heute zu rechnen. Auch 0 ist möglich.
          </p>
        )}
        <p className="vnote">
          Diese Annahmen werden nicht gespeichert und ändern keine Sparpläne. Der historische
          Soll-Pfad und ein persönliches Zieljahr sind noch nicht eingerichtet.
        </p>
      </section>
      <section className="freedom-wide" aria-labelledby="freedom-way">
        <div className="head">
          <h2 id="freedom-way">Weg zum Ziel</h2>
          <span className="aside">Prognose ab heute · keine Garantie</span>
        </div>
        {projection && view.targetCents !== null ? (
          <>
            <FreedomChart
              projection={projection}
              target={view.targetCents}
              startMonth={view.asOf.slice(0, 7)}
            />
            <div className="legend" aria-hidden="true">
              <span>
                <svg viewBox="0 0 26 8">
                  <path className="l-forecast" d="M0 4h26" />
                </svg>
                Prognose ab heute
              </span>
              <span>
                <svg viewBox="0 0 26 8">
                  <path className="l-goal" d="M0 4h26" />
                </svg>
                Ziel {eur(view.targetCents)}
              </span>
            </div>
          </>
        ) : (
          <p className="vnote">
            {reason || error || 'Die Prognose beginnt nach Eingabe einer Sparrate.'}
          </p>
        )}
      </section>
      <section
        className="freedom-wide"
        id="freedom-expenses"
        aria-labelledby="freedom-expense-title"
      >
        <div className="head">
          <h2 id="freedom-expense-title">Woher die Jahresausgaben kommen</h2>
          <span className="aside">Erstattungen sind gegengerechnet</span>
        </div>
        {view.months.length ? (
          <table className="kv-table">
            <caption>Bedarf und Wunsch · abgeschlossene Budgetmonate</caption>
            <thead>
              <tr>
                <th>Monat</th>
                <th>Nettoausgaben</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {view.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthText(m.month)}</td>
                  <td>
                    {m.consumptionCents !== null && Number.isSafeInteger(m.consumptionCents)
                      ? eur(m.consumptionCents)
                      : 'unbekannt'}
                  </td>
                  <td>
                    <AppLink to="/plan/monat" search={{ monat: m.month }}>
                      Budget öffnen
                    </AppLink>
                    <AppLink
                      to="/konten/buchungen"
                      search={{ von: `${m.month}-01`, bis: lastDayOfMonth(m.month) }}
                    >
                      Buchungen öffnen
                    </AppLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="vnote">Noch keine abgeschlossenen Budgetmonate.</p>
        )}
      </section>
      <section
        className="freedom-wide"
        id="freedom-accounts"
        aria-labelledby="freedom-account-title"
      >
        <div className="head">
          <h2 id="freedom-account-title">Investiert: Quellkonten</h2>
          <span className="aside">Kontoguthaben plus Bestände · in Euro</span>
        </div>
        {view.accounts.length ? (
          <table className="kv-table">
            <caption>Anlagekonten am {longDay(view.asOf)}</caption>
            <thead>
              <tr>
                <th>Konto</th>
                <th>Wert</th>
                <th>Bewertung</th>
              </tr>
            </thead>
            <tbody>
              {view.accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <AppLink to={`/konten/${encodeURIComponent(a.id)}`}>{a.name}</AppLink>
                  </td>
                  <td>{a.valueCents === null ? 'unbekannt' : eur(a.valueCents)}</td>
                  <td>
                    {a.missingPrice ? 'Kurs fehlt' : ''}
                    {a.missingFxCurrencies.length
                      ? ` Wechselkurs fehlt: ${a.missingFxCurrencies.join(', ')}`
                      : ''}
                    {a.valueCents !== null
                      ? 'bekannt'
                      : !a.missingPrice && !a.missingFxCurrencies.length
                        ? 'Sicherer Rechenbereich überschritten'
                        : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="vnote">Noch keine Anlagekonten.</p>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setSaving('');
            setReturnBp(view.defaultRealReturnBp);
          }}
        >
          Annahmen zurücksetzen
        </Button>
      </section>
    </>
  );
}
