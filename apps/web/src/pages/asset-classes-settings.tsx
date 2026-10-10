import { Button, Field, Select, TextInput, maskMoneyText } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { eur } from '../ledger/format';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from './placeholder-page';
import {
  assetSettingsQuery,
  useAssetWrite,
  type AssetClassesSettingsView,
} from './asset-classes-api';
import {
  AssetSettingsPanel,
  TargetEditor,
  bpText,
  type EditorControls,
} from '../wealth/target-panel';
import { targetVersionsQuery, type TargetVersion } from '../wealth/allocation-api';
import { InstrumentForm } from '../wealth/instrument-form';
import '../wealth/allocation.css';
import './asset-classes-settings.css';

type ClassRow = AssetClassesSettingsView['classes'][number];
const range = (cls: ClassRow) =>
  cls.isGroup || cls.target?.targetBp == null
    ? '—'
    : `${bpText(Math.max(0, cls.target.targetBp - (cls.target.bandBp ?? 0)))}–${bpText(Math.min(10000, cls.target.targetBp + (cls.target.bandBp ?? 0)))} %`;
const partialTarget = <span title="Nicht alle Klassen haben ein Soll">teilweise</span>;

function SettingsPanelLink({
  panel,
  klasse,
  instrument,
  children,
}: {
  panel: string;
  klasse?: string | undefined;
  instrument?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <AppLink
      className="btn btn-ghost"
      to="/einstellungen/anlageklassen"
      search={() => ({ panel, klasse, instrument })}
      state={{ panelOpenedInApp: true }}
    >
      {children}
    </AppLink>
  );
}
export function AssetClassesSettingsPage() {
  const query = useQuery(assetSettingsQuery());
  const data = query.isError ? undefined : query.data;
  const allocation = data?.allocation;
  const active = data?.classes.filter((c) => c.deletedAt === null) ?? [];
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/anlageklassen')!}
      title="Anlageklassen"
      extraFields={
        allocation
          ? [
              { label: 'Anlageklassen', value: `${active.length} Anlageklassen` },
              {
                label: 'Sollversion',
                value: allocation.policy.targetValidFrom
                  ? `Sollversion ab ${allocation.policy.targetValidFrom.split('-').reverse().join('.')}`
                  : 'Keine Sollversion',
              },
              {
                label: 'Sollsumme',
                value: allocation.policy.targetValidFrom ? '100,00 %' : 'Ohne Sollmodell',
              },
              {
                label: 'Unklassifiziert',
                value:
                  allocation.quality.unclassifiedShareBp === null
                    ? 'Nicht verfügbar'
                    : `${(allocation.quality.unclassifiedShareBp / 100).toFixed(1).replace('.', ',')} % unklassifiziert`,
              },
              {
                label: 'Bewertung',
                value:
                  allocation.valuationQuality === 'exact'
                    ? 'vollständig'
                    : allocation.valuationQuality === 'estimated'
                      ? 'teilweise geschätzt'
                      : 'unvollständig',
              },
            ]
          : []
      }
    >
      <section className="asset-settings" aria-labelledby="asset-list-title">
        <div className="head">
          <h2 id="asset-list-title">Klassen und Sollmodell</h2>
          <div className="asset-actions">
            <SettingsPanelLink panel="anlageklasse">Anlageklasse anlegen</SettingsPanelLink>
            <SettingsPanelLink panel="anlagegruppe">Gruppe anlegen</SettingsPanelLink>
            <SettingsPanelLink panel="sollquoten">Sollquoten bearbeiten</SettingsPanelLink>
          </div>
        </div>
        {query.isPending && <LoadingNote what="Anlageklassen" />}
        {query.isError && (
          <ErrorNote
            what="Anlageklassen"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {allocation && (
          <p className="vnote">
            Anlageuniversum: Depots und Anlage-Cash einschließlich negativer Salden.{' '}
            {allocation.policy.tierIndex !== null
              ? `Aktive Stufe: ${allocation.policy.tierIndex + 1} · Anlagesumme ${eur(allocation.policy.investmentCents ?? 0)}.`
              : ''}{' '}
            {allocation.quality.confidence === 'provisional'
              ? 'Soll/Ist ist vorläufig; Klassifikation und Bewertung prüfen.'
              : ''}
          </p>
        )}
        {data && (
          <table className="rtable asset-class-table">
            <caption className="sr-only">
              Anlageklassen mit Instrumenten, Soll, Band, Ist, Abweichung und Status
            </caption>
            <thead>
              <tr>
                {[
                  'Anlageklasse',
                  'Gruppe',
                  'Instrumente',
                  'Soll',
                  'Band',
                  'Ist',
                  'Abweichung',
                  'Status',
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.classes.map((cls) => (
                <tr key={cls.id}>
                  <th scope="row">
                    <SettingsPanelLink panel="anlageklasse" klasse={cls.id}>
                      {cls.name}
                    </SettingsPanelLink>
                  </th>
                  <td data-label="Gruppe">
                    {cls.isGroup ? (
                      'Gruppe'
                    ) : (
                      <GroupSelect cls={cls} groups={active.filter((c) => c.isGroup)} />
                    )}
                  </td>
                  <td data-label="Instrumente">{cls.instruments.length}</td>
                  <td data-label="Soll">
                    {data.targetsUnavailable
                      ? 'Nicht ermittelbar'
                      : cls.isGroup && !cls.targetComplete
                        ? partialTarget
                        : cls.target?.targetBp == null
                          ? 'Unverwaltet'
                          : `${bpText(cls.target.targetBp)} %`}
                  </td>
                  <td data-label="Band">
                    {data.targetsUnavailable ? 'Nicht ermittelbar' : range(cls)}
                  </td>
                  <td data-label="Ist">
                    {cls.actual
                      ? `${bpText(cls.actual.shareBp)} %`
                      : allocation?.status === 'empty'
                        ? '0,00 %'
                        : '—'}
                  </td>
                  <td data-label="Abweichung">
                    {cls.actual?.deviationBp == null
                      ? '—'
                      : `${cls.actual.deviationBp > 0 ? '+' : ''}${bpText(cls.actual.deviationBp)} pp`}
                  </td>
                  <td data-label="Status">
                    {cls.deletedAt
                      ? 'Archiviert'
                      : cls.actual?.breach
                        ? 'Außerhalb Band'
                        : data.targetsUnavailable
                          ? 'Aktiv · Soll nicht ermittelbar'
                          : cls.target?.targetBp == null
                            ? 'Aktiv · unverwaltet'
                            : 'Aktiv · verwaltet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && !data.classes.length && (
          <p>Noch keine Anlageklassen. Die erste Klasse erhält zunächst keine Sollquote.</p>
        )}
      </section>
    </PageFrame>
  );
}

function GroupSelect({ cls, groups }: { cls: ClassRow; groups: ClassRow[] }) {
  const write = useAssetWrite();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <Select
        aria-label={`Gruppe für ${cls.name}`}
        value={cls.parentId ?? ''}
        disabled={busy || !!cls.deletedAt}
        onChange={(e) => {
          const parentId = e.target.value || null;
          setBusy(true);
          setError('');
          void write(
            () =>
              request('PATCH', `/api/asset-classes/${encodeURIComponent(cls.id)}`, { parentId }),
            'Gruppe gespeichert.',
          )
            .catch((error: unknown) => setError(errorText(error)))
            .finally(() => setBusy(false));
        }}
      >
        <option value="">Eigene Gruppe</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

/** Called by the existing URL-driven host; forms reuse FormDialog and the dirty/save guards. */
export function AssetClassSettingsPanel({
  open,
  onClose,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  mode: string;
}) {
  const query = useQuery({ ...assetSettingsQuery(), enabled: open });
  const versions = useQuery({ ...targetVersionsQuery(), enabled: open });
  const search = useSearch({ strict: false }) as { klasse?: string; instrument?: string };
  const cls = query.data?.classes.find((c) => c.id === search.klasse);
  const instrument = query.data?.securities.find((s) => s.id === search.instrument);
  const title =
    mode === 'instrument'
      ? 'Instrument bearbeiten'
      : mode === 'sollquoten' || mode === 'anlageklasse-archivieren'
        ? 'Sollquoten bearbeiten'
        : (cls?.name ?? (mode === 'anlagegruppe' ? 'Gruppe anlegen' : 'Anlageklasse anlegen'));
  return (
    <AssetSettingsPanel open={open} onClose={onClose} title={title}>
      {(controls) => (
        <>
          {(query.isPending || versions.isPending) && <LoadingNote what="Anlageklassen" />}
          {query.isError && (
            <ErrorNote
              what="Anlageklassen"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          )}
          {versions.isError && (
            <ErrorNote
              what="Sollversionen"
              error={versions.error}
              onRetry={() => void versions.refetch()}
            />
          )}
          {query.data &&
            !query.isError &&
            versions.data &&
            !versions.isError &&
            (mode === 'sollquoten' || mode === 'anlageklasse-archivieren' ? (
              <TargetEditor
                key={mode + (search.klasse ?? '')}
                {...controls}
                view={query.data.allocation}
                versions={versions.data.versions}
                archiveClassId={mode === 'anlageklasse-archivieren' ? search.klasse : undefined}
              />
            ) : mode === 'instrument' ? (
              instrument ? (
                <InstrumentForm
                  key={instrument.id}
                  security={instrument}
                  effectiveDay={query.data.allocation.asOf}
                  {...controls}
                  onSelect={() => controls.onSaved()}
                />
              ) : (
                <p>Das Instrument ist nicht verfügbar.</p>
              )
            ) : search.klasse && !cls ? (
              <p>Die Anlageklasse ist nicht verfügbar.</p>
            ) : (
              <ClassEditor
                key={cls?.id ?? 'new'}
                {...controls}
                cls={cls}
                createGroup={mode === 'anlagegruppe'}
                data={query.data}
                versions={versions.data.versions}
              />
            ))}
        </>
      )}
    </AssetSettingsPanel>
  );
}
function ClassEditor({
  cls,
  createGroup,
  data,
  versions,
  ...controls
}: EditorControls & {
  cls: ClassRow | undefined;
  createGroup: boolean;
  data: AssetClassesSettingsView;
  versions: TargetVersion[];
}) {
  const [name, setName] = useState(cls?.name ?? ''),
    [order, setOrder] = useState(String(cls?.sortOrder ?? data.classes.length)),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const saving = useRef(false);
  const write = useAssetWrite();
  const run = async (action: 'save' | 'archive' | 'restore') => {
    if (saving.current) return;
    const next: Record<string, string> = {};
    if (action === 'save') {
      if (!name.trim() || name.trim().length > 80)
        next['name'] = 'Bitte einen Namen mit 1 bis 80 Zeichen eingeben.';
      if (!/^\d+$/.test(order) || Number(order) > 100000)
        next['order'] = 'Bitte eine Sortierposition zwischen 0 und 100000 eingeben.';
      if (
        data.classes.some(
          (c) =>
            c.id !== cls?.id &&
            c.name.trim().toLocaleLowerCase('de-AT') === name.trim().toLocaleLowerCase('de-AT'),
        )
      )
        next['name'] =
          'Eine Anlageklasse mit diesem Namen ist bereits vorhanden, gegebenenfalls im Archiv.';
    }
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    saving.current = true;
    setBusy(true);
    controls.onBusy(true);
    setErrors({});
    try {
      const path = '/api/asset-classes' + (cls ? '/' + encodeURIComponent(cls.id) : '');
      await write(
        () =>
          request(
            action === 'archive'
              ? 'DELETE'
              : action === 'restore'
                ? 'POST'
                : cls
                  ? 'PATCH'
                  : 'POST',
            action === 'restore' ? path + '/restore' : path,
            action === 'save'
              ? {
                  name: name.trim(),
                  sortOrder: Number(order),
                  ...(!cls ? { isGroup: createGroup } : {}),
                }
              : undefined,
          ),
        action === 'archive'
          ? 'Anlageklasse archiviert.'
          : action === 'restore'
            ? 'Anlageklasse wieder aktiviert.'
            : cls
              ? 'Anlageklasse gespeichert.'
              : 'Anlageklasse angelegt.',
      );
      controls.onDirty(false);
      controls.onSaved();
    } catch (error) {
      setErrors({ [action === 'save' ? 'name' : 'form']: errorText(error) });
    } finally {
      saving.current = false;
      setBusy(false);
      controls.onBusy(false);
    }
  };
  return (
    <>
      <form
        className="kform asset-class-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run('save');
        }}
      >
        <fieldset disabled={busy || !!cls?.deletedAt}>
          <Field
            label={cls?.isGroup || createGroup ? 'Name der Gruppe' : 'Name der Anlageklasse'}
            error={errors['name']}
          >
            {({ id, invalid, describedBy }) => (
              <TextInput
                id={id}
                value={name}
                maxLength={80}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors({});
                  controls.onDirty(true);
                }}
              />
            )}
          </Field>
          <Field label="Sortierposition" error={errors['order']}>
            {({ id, invalid, describedBy }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={order}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setOrder(e.target.value);
                  controls.onDirty(true);
                }}
              />
            )}
          </Field>
          <Button type="submit">
            {busy
              ? 'Speichert …'
              : cls
                ? 'Änderungen speichern'
                : createGroup
                  ? 'Gruppe anlegen'
                  : 'Anlageklasse anlegen'}
          </Button>
        </fieldset>
      </form>
      {cls && (
        <>
          <dl className="asset-detail">
            <dt>Status</dt>
            <dd>{cls.deletedAt ? 'Archiviert' : 'Aktiv'}</dd>
            <dt>Marktwert</dt>
            <dd>
              {cls.actual
                ? eur(cls.actual.valueCents)
                : data.allocation.status === 'empty'
                  ? eur(0)
                  : 'Nicht verfügbar'}
            </dd>
            <dt>Ist</dt>
            <dd>{cls.actual ? `${bpText(cls.actual.shareBp)} %` : '—'}</dd>
            <dt>Soll</dt>
            <dd>
              {data.targetsUnavailable
                ? 'Nicht ermittelbar'
                : cls.isGroup && !cls.targetComplete
                  ? partialTarget
                  : cls.target?.targetBp == null
                    ? 'Unverwaltet'
                    : `${bpText(cls.target.targetBp)} %`}
            </dd>
            <dt>Band</dt>
            <dd>{data.targetsUnavailable ? 'Nicht ermittelbar' : range(cls)}</dd>
            <dt>Abweichung</dt>
            <dd>
              {cls.actual?.deviationBp == null ? '—' : `${bpText(cls.actual.deviationBp)} pp`}
            </dd>
            <dt>Gültig ab</dt>
            <dd>{cls.target?.validFrom ?? '—'}</dd>
          </dl>
          <div className="asset-actions">
            {!cls.deletedAt && (
              <SettingsPanelLink panel="sollquoten">Soll und Band bearbeiten</SettingsPanelLink>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(cls.deletedAt ? 'restore' : 'archive')}
            >
              {cls.deletedAt ? 'Wieder aktivieren' : 'Archivieren'}
            </Button>
            {!cls.deletedAt && (
              <SettingsPanelLink panel="anlageklasse-archivieren" klasse={cls.id}>
                Ersatz-Sollversion und archivieren
              </SettingsPanelLink>
            )}
          </div>
          <h3>Zugeordnete Instrumente und Exposure</h3>
          {cls.instruments.length ? (
            <ul className="asset-instruments">
              {cls.instruments.map((s) => (
                <li key={s.id}>
                  <SettingsPanelLink panel="instrument" instrument={s.id}>
                    {s.name} · Zuordnung bearbeiten
                  </SettingsPanelLink>
                  <p className="vnote">
                    Ab {s.exposure!.validFrom} ·{' '}
                    {s.exposure!.complete ? 'vollständig' : 'unvollständig'} ·{' '}
                    {s
                      .exposure!.weights.map(
                        (w) =>
                          `${data.classes.find((c) => c.id === w.assetClassId)?.name ?? 'Anlageklasse'} ${bpText(w.weightBp)} %`,
                      )
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Keine Instrumente zugeordnet.</p>
          )}
          <h3>Instrument zuordnen</h3>
          <ul className="asset-instruments">
            {data.securities
              .filter((s) => !cls.instruments.some((i) => i.id === s.id))
              .map((s) => (
                <li key={s.id}>
                  <SettingsPanelLink panel="instrument" instrument={s.id}>
                    {s.name}
                  </SettingsPanelLink>
                </li>
              ))}
          </ul>
          <h3>Sollhistorie</h3>
          <ul>
            {versions.map((v) => (
              <li key={v.validFrom}>
                Ab {v.validFrom}
                {v.label ? ` · ${v.label}` : ''} ·{' '}
                {v.tiers.length
                  ? v.tiers
                      .map(
                        (t, i) =>
                          `Stufe ${i + 1}: ${t.targets.find((t) => t.assetClassId === cls.id)?.targetShareBp === undefined ? 'Unverwaltet' : bpText(t.targets.find((t) => t.assetClassId === cls.id)!.targetShareBp) + ' %'}`,
                      )
                      .join(' · ')
                  : v.targets.find((t) => t.assetClassId === cls.id)
                    ? bpText(v.targets.find((t) => t.assetClassId === cls.id)!.targetShareBp) + ' %'
                    : 'Unverwaltet'}
                {v.reason ? ` · ${v.reason}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {errors['form'] && (
        <p className="field-error" role="alert">
          {maskMoneyText(errors['form'])}
        </p>
      )}
    </>
  );
}
