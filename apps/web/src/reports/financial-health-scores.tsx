import {
  formatPercent,
  type FinancialHealthAssessment,
  type HealthCategory,
  type HealthMetricId,
  type HealthReason,
} from '@budget/domain';
import { Button, privateAmount, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { financialHealthQuery } from './financial-health-api';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './financial-health-scores.css';

const titles = {
  cashflow: 'Cashflow und Notgroschen',
  debt: 'Schulden und Schuldendienst',
  portfolio: 'Portfolio und Konzentration',
};
const metricTitles: Record<HealthMetricId, string> = {
  cashflow: 'Sparfähigkeit',
  reserves: 'Notgroschen',
  debt: 'Schuldendienst',
  structure: 'R13 · Portfoliostruktur',
  concentration: 'R14 · Konzentration',
  speculation: 'R15 · Spekulatives Exposure',
};
const reasons: Record<HealthReason, string> = {
  no_data: 'Noch keine auswertbaren Kontodaten.',
  source_unavailable: 'Die gemeinsame Datenquelle ist derzeit nicht vollständig berechenbar.',
  valuation_unavailable:
    'Bewertung oder Klassifikation ist unvollständig, geschätzt oder veraltet.',
  incomplete_service: 'Die Zahlungsverpflichtung ist nicht für jede Schuld vollständig belegt.',
  missing_income: 'Kein verwendbares positives Referenzeinkommen.',
  missing_history: 'Kein vollständiges, verwendbares Ausgaben- oder Einnahmenfenster.',
  missing_targets: 'Die gültigen Anlageklassenziele sind nicht vollständig belegt.',
  unknown_platform: 'Für die Konzentrationsprüfung fehlt eine erforderliche Plattformzuordnung.',
  invalid_source: 'Quelldaten oder Zielparameter sind nicht verwendbar.',
  date_mismatch: 'Die Quelldaten haben keinen gemeinsamen verwendbaren Stichtag.',
  no_portfolio:
    'Keine bewertbaren Positionen im ausdrücklich gewählten Allokationsumfang. Außerhalb dieses Umfangs wird keine Aussage getroffen.',
};

function subscribeOnline(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

export function FinancialHealthScores() {
  return REDESIGN_ENABLED ? <CurrentFinancialHealthScores /> : null;
}

function CurrentFinancialHealthScores() {
  const query = useQuery(financialHealthQuery());
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  return (
    <section className="card ov-card health-assessment" aria-labelledby="health-title">
      <div className="tbd-head">
        <h2 id="health-title">Financial Health Scores</h2>
        <Button
          variant="ghost"
          disabled={!online || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Bewertung aktualisieren
        </Button>
      </div>
      <p>Aktuelle Bewertung · drei Bereiche, ein gemeinsamer Stichtag</p>
      {query.isPending && <LoadingNote what="Health Scores" />}
      {query.isError && (
        <ErrorNote what="Health Scores" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <HealthAssessmentView
          assessment={query.data}
          stale={!online || query.isError || query.isFetching}
          offline={!online}
        />
      )}
    </section>
  );
}

export function HealthAssessmentView({
  assessment,
  stale = false,
  offline = false,
}: {
  assessment: FinancialHealthAssessment;
  stale?: boolean;
  offline?: boolean;
}) {
  useAmountPrivacy();
  const points = (score: number | null) =>
    score === null ? 'Nicht bewertbar' : `${privateAmount(String(score))} von 100`;
  return (
    <div data-testid="health-assessment" data-health-asof={assessment.asOf}>
      {stale && (
        <p role="status" className="health-stale">
          {offline ? 'Offline · ' : ''}Letzter bekannter Stand vom {longDay(assessment.asOf)}. Die
          Bewertung ist derzeit nicht aktuell bestätigt.
        </p>
      )}
      <div className="health-summary">
        <div>
          <span>Gesamtbewertung{stale ? ' · letzter Stand' : ''}</span>
          <strong data-testid="health-overall-score">{points(assessment.score)}</strong>
        </div>
        <div>
          <span>Datenabdeckung</span>
          <strong data-testid="health-coverage">
            {privateAmount(formatPercent(assessment.coverageBp))}
          </strong>
          <span>
            {privateAmount(
              `${assessment.evaluatedCategories} von ${assessment.applicableCategories}`,
            )}{' '}
            anwendbaren Bereichen bewertet
          </span>
        </div>
        <p>
          Stand {longDay(assessment.asOf)}
          <br />
          Methode {assessment.method}
        </p>
      </div>
      {assessment.score === null && (
        <p className="health-unavailable">
          Keine Gesamtbewertung: Anwendbare Quelldaten fehlen oder sind nicht verwendbar. Bekannte
          Teilwerte bleiben sichtbar; fehlende Werte erhalten keine gesunden Punkte.
        </p>
      )}
      <div className="health-categories">
        {assessment.categories.map((category) => (
          <HealthCategoryView key={category.id} category={category} asOf={assessment.asOf} />
        ))}
      </div>
      <details className="health-method">
        <summary>Methode und Datenabdeckung</summary>
        <p>
          Gewählte Orientierung, keine allgemeingültige Finanzregel. Cashflow und Notgroschen wiegen
          40, Schulden 30 und Portfolio 30. Innerhalb des Cashflows: Sparfähigkeit und Reserve je
          50. Im Portfolio: Struktur und Konzentration je 40, spekulatives Exposure 20.
        </p>
        <p>
          Gemeinsame Regelbefunde ergeben 100 Punkte bei erfüllt, 50 bei Warnung und 0 bei verletzt.
          Sparfähigkeit und Reserve steigen bis zu ihrem gespeicherten Ziel linear von 0 auf 100.
          Zuerst wird der Teilwert, dann der Bereich und zuletzt das gewichtete Gesamtmittel
          gerundet.
        </p>
        <p>
          Nur ein nachweislich leerer Allokationsumfang ist nicht anwendbar. Dessen Gewicht
          entfällt. Unbekannte Daten entfallen nie aus der Gewichtung. Datenabdeckung misst die
          belegten Kriteriengewichte innerhalb der anwendbaren Bereiche, getrennt von der Bewertung.
        </p>
        <p>
          Die Bewertung nutzt die festgelegten Kriterien und gespeicherten Grenzwerte auch bei
          deaktivierten Regeln. Risikoneigung und Familiensituation werden nicht abgeleitet und
          verändern keine Ziele. Die Bewertung löst keine Buchung oder andere Geldaktion aus.
        </p>
        <AppLink to="/einstellungen/regelwerk">Regelparameter und Ziele prüfen</AppLink>
      </details>
    </div>
  );
}

function HealthCategoryView({ category, asOf }: { category: HealthCategory; asOf: string }) {
  const exempt = category.state === 'not_applicable';
  const score = exempt
    ? 'Nicht anwendbar'
    : category.score === null
      ? 'Nicht bewertbar'
      : `${privateAmount(String(category.score))} von 100`;
  const missing = [
    ...new Set(category.metrics.flatMap((m) => (m.reason ? [reasons[m.reason]] : []))),
  ];
  return (
    <section className="health-category" aria-labelledby={`health-${category.id}-title`}>
      <div className="health-category-head">
        <h3 id={`health-${category.id}-title`}>{titles[category.id]}</h3>
        <strong data-testid={`health-score-${category.id}`}>{score}</strong>
      </div>
      <p>
        {exempt
          ? reasons.no_portfolio
          : category.score === null
            ? missing.join(' ')
            : category.metrics.map((m) => m.explanation).join(' ')}
      </p>
      <p className="health-meta">
        Gewicht {category.weight}
        {exempt
          ? ' · entfällt'
          : ` · Datenabdeckung ${privateAmount(formatPercent(category.coverageBp))}`}
      </p>
      <details className="health-calculation">
        <summary>Berechnung · {titles[category.id]}</summary>
        {category.metrics.map((m) => (
          <div className="health-metric" key={m.id}>
            <h4>
              {metricTitles[m.id]} ·{' '}
              {m.score === null
                ? m.state === 'not_applicable'
                  ? 'nicht anwendbar'
                  : 'nicht bewertbar'
                : `${privateAmount(String(m.score))} Punkte`}
            </h4>
            <p>
              Gewicht im Bereich {m.weight} · Stichtag {longDay(asOf)}
            </p>
            {m.source.state === 'available' && (
              <p>
                Quellfenster {longDay(m.source.window.from)} bis {longDay(m.source.window.to)}
              </p>
            )}
            {m.basis.map((basis, i) => (
              <p key={i}>{privateAmount(basis)}</p>
            ))}
            {m.reason && <p>{reasons[m.reason]}</p>}
            {m.explanation && <p>{m.explanation}</p>}
          </div>
        ))}
        {category.id === 'cashflow' ? (
          <>
            <AppLink to="/reports/sparquote">Sparquote und Geldalter öffnen</AppLink>
            <AppLink to="/einstellungen/regelwerk" hash="rule-result-R11">
              Cashflow-Referenz im Regelwerk öffnen
            </AppLink>
            <AppLink to="/einstellungen/regelwerk" hash="rule-result-R02">
              Notgroschen im Regelwerk öffnen
            </AppLink>
          </>
        ) : category.id === 'debt' ? (
          <>
            <AppLink to="/vermoegen/schulden">Schulden und Konditionen öffnen</AppLink>
            <AppLink to="/einstellungen/regelwerk" hash="rule-result-R08">
              Schuldendienst im Regelwerk öffnen
            </AppLink>
          </>
        ) : (
          <AppLink to="/vermoegen/portfolio/allokation">
            Allokation und Risikogrenzen öffnen
          </AppLink>
        )}
      </details>
    </section>
  );
}
