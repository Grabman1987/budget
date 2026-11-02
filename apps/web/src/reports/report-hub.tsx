import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import {
  HUB_GROUPS,
  matchingHubReports,
  recentReports,
  reportAliases,
  MOVED_REPORTS,
  type HubReport,
  type HubGroup,
} from './report-hub-model';
import { SavedExplorerLinks } from './saved-explorer-links';
import './report-hub.css';

export function ReportHub({ initialGroup }: { initialGroup?: HubGroup | undefined }) {
  const [group, setGroup] = useState<HubGroup | undefined>(initialGroup);
  const [search, setSearch] = useState('');
  const [recent] = useState(recentReports);
  const reports = matchingHubReports(search, group);
  const row = (report: HubReport) => (
    <li key={report.id} value={report.no}>
      <AppLink to={`/reports/${report.id}`}>
        <span className="report-hub-number" aria-hidden="true">
          {report.no}
        </span>
        <strong>{report.name}</strong>
        <span className="report-hub-question">{report.question}</span>
        <span className="report-hub-group">
          {HUB_GROUPS.find((item) => item.id === report.group)?.name}
        </span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </AppLink>
      {REDESIGN_ENABLED && reportAliases(report).length > 0 && (
        <nav className="report-hub-aliases" aria-label={`Ansichten: ${report.name}`}>
          <span>Ansichten:</span>
          {reportAliases(report).map((source) => (
            <AppLink key={source.id} to={`/reports/${source.id}`}>
              {source.name}
            </AppLink>
          ))}
        </nav>
      )}
    </li>
  );
  return (
    <div className={`report-hub${REDESIGN_ENABLED ? ' report-hub-v2' : ''}`}>
      <section className="report-hub-recent" aria-labelledby="recent-reports-title">
        <h2 id="recent-reports-title">Zuletzt geöffnet</h2>
        {recent.length === 0 ? (
          <p>Noch kein Bericht in dieser Sitzung geöffnet.</p>
        ) : (
          <nav aria-label="Zuletzt geöffnete Berichte">
            {recent.map((report) => (
              <AppLink key={report.id} to={`/reports/${report.id}`}>
                <span>{report.name}</span>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </AppLink>
            ))}
          </nav>
        )}
      </section>
      <SavedExplorerLinks />
      <section className="report-hub-catalog" aria-labelledby="report-catalog-title">
        <div className="report-hub-search">
          <h2 id="report-catalog-title">Alle Berichte</h2>
          <label>
            <span className="sr-only">Berichte nach Name oder Frage suchen</span>
            <input
              type="search"
              className={REDESIGN_ENABLED ? 'input' : undefined}
              placeholder={
                REDESIGN_ENABLED ? 'Report suchen, auch frühere Namen' : 'Name oder Frage suchen'
              }
              value={search}
              maxLength={160}
              autoComplete="off"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="report-hub-groups" role="group" aria-label="Berichtsgruppen">
          <button type="button" aria-pressed={!group} onClick={() => setGroup(undefined)}>
            Alle
          </button>
          {HUB_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              onClick={() => setGroup(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status">
          {reports.length} von 16 Berichten
        </p>
        {reports.length === 0 ? (
          <p>Kein Bericht passt zu dieser Suche und Gruppe.</p>
        ) : REDESIGN_ENABLED ? (
          <div className="report-hub-columns">
            {HUB_GROUPS.map((item) => {
              const entries = reports.filter((report) => report.group === item.id);
              return (
                entries.length > 0 && (
                  <section
                    key={item.id}
                    className={`report-hub-section report-hub-section-${item.id}`}
                    aria-labelledby={`hub-${item.id}`}
                  >
                    <h3 id={`hub-${item.id}`}>{item.name}</h3>
                    <ol className="report-hub-list" aria-label={item.name}>
                      {entries.map(row)}
                    </ol>
                  </section>
                )
              );
            })}
          </div>
        ) : (
          <ol className="report-hub-list" aria-label="Katalog der Reports">
            {reports.map(row)}
          </ol>
        )}
      </section>
      {REDESIGN_ENABLED && (
        <nav className="report-hub-moved" aria-label="Nach Plan verschobene Berichte">
          <span>In Plan:</span>
          {MOVED_REPORTS.filter((report) =>
            `${report.name} ${report.destination}`
              .toLocaleLowerCase('de-AT')
              .includes(search.trim().toLocaleLowerCase('de-AT')),
          ).map((report) => (
            <AppLink key={report.id} to={`/reports/${report.id}`}>
              {report.name} → {report.destination}
            </AppLink>
          ))}
        </nav>
      )}
    </div>
  );
}
