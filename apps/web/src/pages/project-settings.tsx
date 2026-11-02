import { ScrollRegion } from '../reports/spending-shared';
import type { project } from '@budget/db';
import { Button } from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PageFrame } from './placeholder-page';
import { PAGES } from '../nav/pages';
import '../reports/payroll-projects.css';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { SettingsDraftGuard } from './settings-draft-guard';
import { SettingsRowMenu } from './settings-row-menu';

const projectsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'project-management'],
  retry: false,
  queryFn: () => request<{ projects: (typeof project.$inferSelect)[] }>('GET', '/api/projects'),
});
export function ProjectSettings() {
  const query = useQuery(projectsQuery);
  const write = useBudgetWrite();
  const [name, setName] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const result = await write(
      () =>
        request<{ groupId: string }>(
          editing ? 'PATCH' : 'POST',
          editing ? `/api/projects/${encodeURIComponent(editing)}` : '/api/projects',
          { name },
        ),
      () => (editing ? 'Projekt umbenannt.' : 'Projekt angelegt.'),
    );
    setBusy(false);
    if (result) {
      setName('');
      setEditing(null);
    }
  };
  const archive = async (id: string, archived: boolean) => {
    setBusy(true);
    await write(
      () =>
        request<{ groupId: string }>('PATCH', `/api/projects/${encodeURIComponent(id)}`, {
          archived,
        }),
      () => (archived ? 'Projekt archiviert.' : 'Projekt wieder aktiviert.'),
    );
    setBusy(false);
  };
  if (REDESIGN_ENABLED)
    return (
      <PageFrame meta={PAGES.find((p) => p.path === '/einstellungen/projekte')!}>
        <section className="settings-projects-v2" aria-labelledby="settings-projects-title">
          <div className="settings-primary-head">
            <h2 id="settings-projects-title">Projekte</h2>
          </div>
          <SettingsDraftGuard dirty={name.trim() !== ''} busy={busy} />
          <form
            className="settings-project-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              Projektname
              <input
                value={name}
                required
                maxLength={120}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy}>
              {editing ? 'Umbenennen' : 'Projekt anlegen'}
            </Button>
            {(editing || name) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Ungespeicherte Änderungen verwerfen?')) {
                    setEditing(null);
                    setName('');
                  }
                }}
              >
                Abbrechen
              </Button>
            )}
          </form>
          {query.isPending && <LoadingNote what="Projekte" />}
          {query.isError && (
            <ErrorNote what="Projekte" error={query.error} onRetry={() => void query.refetch()} />
          )}
          {query.data?.projects.length === 0 && <p>Noch keine Projekte angelegt.</p>}
          {query.data && (
            <div className="settings-surface">
              {query.data.projects.map((p) => (
                <div className="settings-row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.archivedAt ? 'archiviert' : 'aktiv'}</small>
                  </div>
                  <SettingsRowMenu name={p.name}>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!name || window.confirm('Ungespeicherte Änderungen verwerfen?')) {
                          setEditing(p.id);
                          setName(p.name);
                          document
                            .querySelector<HTMLInputElement>('.settings-project-form input')
                            ?.focus();
                        }
                      }}
                    >
                      Umbenennen
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void archive(p.id, !p.archivedAt)}
                    >
                      {p.archivedAt ? 'Aktivieren' : 'Archivieren'}
                    </Button>
                  </SettingsRowMenu>
                </div>
              ))}
            </div>
          )}
          <p className="settings-source-stamp">
            Archivierte Projekte behalten ihre Buchungen und bleiben im Report sichtbar.
          </p>
        </section>
      </PageFrame>
    );
  return (
    <PageFrame meta={PAGES.find((p) => p.path === '/einstellungen/projekte')!}>
      <section className="pp-settings">
        <h2>Projekte verwalten</h2>
        <p>
          Projekte auf Buchungen zuordnen. Archivierte Projekte behalten ihre Buchungen und bleiben
          im Report sichtbar.
        </p>
        <form
          className="pp-name-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Projektname
            <input
              value={name}
              required
              maxLength={120}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {editing ? 'Umbenennen' : 'Projekt anlegen'}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setName('');
              }}
            >
              Abbrechen
            </Button>
          )}
        </form>
        {query.isFetching && <LoadingNote what="Projekte" />}
        {query.isError && (
          <ErrorNote what="Projekte" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isSuccess && !query.isFetching && (
          <ScrollRegion className="pp-scroll" label="Projektverwaltung">
            <table className="rtable">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Projekt</th>
                  <th>Status</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {query.data.projects.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <th>{p.name}</th>
                    <td>{p.archivedAt ? 'archiviert' : 'aktiv'}</td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditing(p.id);
                          setName(p.name);
                        }}
                      >
                        Umbenennen
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void archive(p.id, !p.archivedAt)}
                      >
                        {p.archivedAt ? 'Aktivieren' : 'Archivieren'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </section>
    </PageFrame>
  );
}
