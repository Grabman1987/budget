import {
  defaultBandBp,
  parseScaledDecimal,
  parseAmount,
  targetTierStarts,
  targetTiersFromStarts,
  WEALTH_STAGE_ROLES,
  wealthStageTemplate,
  type WealthStageRole,
  type ManagedTarget,
} from '@budget/domain';
import { Button, Field, Select, TextInput, maskMoneyText } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { longDay } from '../ledger/format';
import { useAssetWrite } from '../pages/asset-classes-api';
import type { PortfolioAllocationView, TargetVersion } from './allocation-api';
import type { AllocationAccountChange } from '@budget/db';
import { AllocationScopeEditor } from './allocation-scope-editor';
import { AppLink } from '../shell/app-link';
import { SettingsFormDialog } from '../pages/settings-form-dialog';

export const bpText = (bp: number) =>
  `${bp < 0 ? '−' : ''}${(Math.abs(bp) / 100).toFixed(2).replace('.', ',')}`;
export function readBp(value: string) {
  const raw = value.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const bp = parseScaledDecimal(raw, 2);
  return bp <= 10000 ? bp : null;
}
export type EditorControls = {
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  onSaved: () => void;
};
/** One URL-driven shell for class and policy forms, including Back/dirty/pending-save guards. */
export function AssetSettingsPanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: (controls: EditorControls) => ReactNode;
}) {
  const dirty = useRef(false),
    saving = useRef(false),
    blockedSaving = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Changing URL-driven editors keeps the same dialog and its original return target. If the
    // focused editor control was removed, move focus to the persistent close button.
    const dialog = content.current?.closest('dialog');
    if (open && dialog?.open && !dialog.contains(document.activeElement))
      dialog.querySelector<HTMLButtonElement>('.panel-head button')?.focus();
  }, [open, title]);
  const [busy, setBusy] = useState(false),
    [asking, setAsking] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (saving.current) blockedSaving.current = true;
      return saving.current || dirty.current;
    },
    withResolver: true,
    enableBeforeUnload: () => saving.current || dirty.current,
  });
  const { status, reset } = blocker;
  useEffect(() => {
    if (status !== 'blocked') return;
    if (blockedSaving.current || saving.current) {
      blockedSaving.current = false;
      reset();
    } else setAsking(true);
  }, [status, reset, busy]);
  const onDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const onBusy = useCallback((value: boolean) => {
    saving.current = value;
    setBusy(value);
  }, []);
  const close = useCallback(() => {
    dirty.current = false;
    saving.current = false;
    setAsking(false);
    onClose();
  }, [onClose]);
  return (
    <SettingsFormDialog
      open={open}
      title={title}
      onClose={close}
      beforeClose={() => {
        if (saving.current || blocker.status === 'blocked') return false;
        if (!dirty.current) return true;
        setAsking(true);
        return false;
      }}
    >
      <div ref={content}>
        {/* eslint-disable-next-line react-hooks/refs -- These are event callbacks; the render prop only passes them to editors, never invokes them during render. */}
        {children({
          onDirty,
          onBusy,
          onSaved: close,
        })}
      </div>
      {asking && (
        <div className="instrument-discard" role="alert">
          <p>Ungespeicherte Änderungen verwerfen?</p>
          <Button
            variant="ghost"
            onClick={() => {
              setAsking(false);
              if (blocker.status === 'blocked') blocker.reset();
            }}
          >
            Weiter bearbeiten
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              dirty.current = false;
              setAsking(false);
              if (blocker.status === 'blocked') blocker.proceed();
              else close();
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
    </SettingsFormDialog>
  );
}
type Entry = { included: boolean; share: string; bandMode: 'standard' | 'custom'; band: string };
type TierDraft = {
  limit: string;
  entries: Record<string, Entry>;
  label?: string;
  condition?: string;
};
function entriesFor(view: PortfolioAllocationView, targets: ManagedTarget[]) {
  return Object.fromEntries(
    view.classes.map((c) => {
      const t = targets.find((t) => t.assetClassId === c.id);
      return [
        c.id,
        {
          included: !!t,
          share: bpText(t?.targetShareBp ?? 0),
          bandMode: t?.bandMode ?? (t?.bandBp ? 'custom' : 'standard'),
          band: bpText(t?.bandBp ?? 0),
        },
      ];
    }),
  );
}
export function TargetEditor({
  view,
  versions,
  archiveClassId,
  ...controls
}: EditorControls & {
  view: PortfolioAllocationView;
  versions: TargetVersion[];
  archiveClassId?: string | undefined;
}) {
  const [allocationAccounts, setAllocationAccounts] = useState<AllocationAccountChange[]>([]);
  const [exampleClasses, setExampleClasses] = useState<Record<WealthStageRole, string>>({
    world: '',
    leveraged: '',
    managed: '',
    reserve: '',
  });
  const [confirmExample, setConfirmExample] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const initial = versions.filter((v) => v.validFrom <= view.asOf).at(-1);
  const [date, setDate] = useState(view.asOf),
    [label, setLabel] = useState(initial?.label ?? ''),
    [reason, setReason] = useState(initial?.reason ?? '');
  const [tiers, setTiers] = useState<TierDraft[]>(() =>
    initial?.tiers.length
      ? initial.tiers.map((t, i) => ({
          limit: bpText(targetTierStarts(initial.tiers)[i]!),
          entries: entriesFor(view, t.targets),
          label: t.label ?? '',
          condition: t.condition ?? '',
        }))
      : [{ limit: '', entries: entriesFor(view, initial?.targets ?? []) }],
  );
  const [dynamic, setDynamic] = useState(!!initial?.tiers.length),
    [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [wantedTemplate, setWantedTemplate] = useState<TargetVersion | null>(null);
  const saving = useRef(false);
  const write = useAssetWrite();
  const changed = () => {
    setDirty(true);
    controls.onDirty(true);
    setErrors({});
  };
  const update = (id: string, patch: Partial<Entry>, row = selected) => {
    changed();
    setTiers(
      tiers.map((t, i) =>
        i !== row ? t : { ...t, entries: { ...t.entries, [id]: { ...t.entries[id]!, ...patch } } },
      ),
    );
  };
  const load = (v: TargetVersion) => {
    changed();
    setWantedTemplate(null);
    setDate(v.validFrom);
    setLabel(v.label ?? '');
    setReason(v.reason ?? '');
    setDynamic(!!v.tiers.length);
    setSelected(0);
    setTiers(
      v.tiers.length
        ? v.tiers.map((t, i) => ({
            limit: bpText(targetTierStarts(v.tiers)[i]!),
            entries: entriesFor(view, t.targets),
            label: t.label ?? '',
            condition: t.condition ?? '',
          }))
        : [{ limit: '', entries: entriesFor(view, v.targets) }],
    );
  };
  const sums = tiers.map((tier) =>
    Object.values(tier.entries)
      .filter((e) => e.included)
      .reduce((sum, e) => sum + (readBp(e.share) ?? 0), 0),
  );
  const save = async () => {
    if (saving.current) return;
    const nextErrors: Record<string, string> = {};
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      nextErrors['date'] = 'Bitte ein gültiges Wirksamkeitsdatum eingeben.';
    const prepared = tiers.map((tier, i) => {
      const targets = view.classes.flatMap((c): ManagedTarget[] => {
        const e = tier.entries[c.id]!;
        if (!e.included) return [];
        const share = readBp(e.share),
          band = readBp(e.band);
        if (share === null)
          nextErrors[i + ':' + c.id + ':share'] =
            c.name + ': Bitte einen Wert zwischen 0,00 und 100,00 % eingeben.';
        if (e.bandMode === 'custom' && band === null)
          nextErrors[i + ':' + c.id + ':band'] =
            'Bitte ein Band zwischen 0,00 und 100,00 Prozentpunkten eingeben.';
        return [
          {
            assetClassId: c.id,
            targetShareBp: share ?? 0,
            bandBp: e.bandMode === 'custom' ? (band ?? 0) : 0,
            bandMode: e.bandMode,
          },
        ];
      });
      if (sums[i] !== 10000)
        nextErrors[dynamic ? 'sum:' + i : 'sum'] =
          'Stufe ' +
          (i + 1) +
          ': Die Sollquoten ergeben ' +
          bpText(sums[i]!) +
          ' %. Erforderlich sind genau 100,00 %.';
      let fromCents = 0;
      if (dynamic && i > 0) {
        const parsed = parseAmount(tier.limit.replace(/,[-–]\s*$/, ',00'));
        if (!parsed.ok || parsed.cents <= 0)
          nextErrors['limit:' + i] = 'Bitte einen positiven Betrag für „Ab Vermögen“ eingeben.';
        else fromCents = parsed.cents;
      }
      return {
        fromCents,
        targets,
        label: tier.label ?? '',
        condition: tier.condition ?? '',
      };
    });
    for (let i = 1; i < prepared.length; i++)
      if (prepared[i]!.fromCents <= prepared[i - 1]!.fromCents)
        nextErrors['limit:' + i] = 'Vermögensstufen müssen aufsteigend sein.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const bad = Object.keys(nextErrors).find((k) => /^(\d+:|limit:)/.test(k));
      if (bad)
        setSelected(Number(bad.startsWith('limit:') ? bad.split(':')[1] : bad.split(':')[0]));
      return;
    }
    saving.current = true;
    setBusy(true);
    controls.onBusy(true);
    try {
      await write(
        () =>
          request('PUT', '/api/asset-classes/targets', {
            validFrom: date,
            label: label || null,
            reason: reason || null,
            targets: prepared[0]!.targets,
            tiers: dynamic ? targetTiersFromStarts(prepared) : [],
            ...(allocationAccounts.length ? { allocationAccounts } : {}),
            ...(archiveClassId ? { archiveClassId } : {}),
          }),
        archiveClassId
          ? 'Sollversion gespeichert und Anlageklasse archiviert.'
          : 'Sollversion gespeichert.',
      );
      controls.onDirty(false);
      controls.onSaved();
    } catch (error) {
      setErrors({ form: errorText(error) });
    } finally {
      saving.current = false;
      setBusy(false);
      controls.onBusy(false);
    }
  };
  const tier = tiers[selected]!;
  const rowErrorPrefix = useId();
  const [visibleClasses, setVisibleClasses] = useState(() => view.classes.map((c) => c.id));
  const columns = view.classes.filter((c) => visibleClasses.includes(c.id));
  const savedRows =
    !dirty && initial?.validFrom === view.policy.targetValidFrom && date <= view.asOf;
  const savedStage = view.policy.tierIndex;
  const stageStatus = (index: number) =>
    !savedRows
      ? 'Entwurf'
      : savedStage === null
        ? 'Nicht ermittelt'
        : index === savedStage
          ? view.policy.wealthStage?.inBuffer
            ? 'Puffer'
            : 'aktiv'
          : 'aus';
  const patchTier = (index: number, patch: Partial<Omit<TierDraft, 'entries'>>) => {
    changed();
    setTiers(tiers.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const scope = (
    <AllocationScopeEditor
      view={view}
      changes={allocationAccounts}
      onChange={(next) => {
        changed();
        setAllocationAccounts(next);
      }}
    />
  );
  return (
    <form
      className="kform asset-target-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy}>
        {dynamic ? (
          <details className="stage-scope">
            <summary>Konten und Depots auswählen</summary>
            {scope}
          </details>
        ) : (
          scope
        )}
        <details className="stage-reference" open={!dynamic}>
          <summary>Vorlagen und Erläuterungen</summary>
          <div className="stage-reference-content">
            <h3>2. Sollmodell und Vermögensstufen</h3>
            <p className="vnote">
              <AppLink to="/einstellungen/anlageklassen" search={{}}>
                Anlageklassen und Wertpapiere verwalten
              </AppLink>
            </p>
            <details
              className="wealth-details"
              open={exampleOpen}
              onToggle={(e) => setExampleOpen(e.currentTarget.open)}
            >
              <summary>Beispielplan mit sieben Vermögensstufen</summary>
              <p className="vnote">
                0 / 10.000 / 50.000 / 100.000 / 500.000 / 1 Mio. / 2 Mio. €. Ordne zuerst vorhandene
                Anlageklassen zu. Ihre Wertpapiere bleiben erhalten. Jede Stufe ist anschließend
                frei bearbeitbar.
              </p>
              {WEALTH_STAGE_ROLES.map(([role, name]) => (
                <Field key={role} label={'Vorlage · ' + name}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={exampleClasses[role]}
                      onChange={(e) => {
                        setExampleClasses({ ...exampleClasses, [role]: e.target.value });
                        setConfirmExample(false);
                      }}
                    >
                      <option value="">Anlageklasse auswählen</option>
                      {view.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
              <p className="vnote">
                Start: 85 % Weltaktien und 15 % Aktien mit Hebel; als Sparratenbeispiel 340 € + 60 €
                pro Monat. Ab 10.000 €: 75 / 5 / 20 %. Ab 500.000 € bei Liquiditätsbedarf: 65 / 5 /
                20 / 10 %. Ab 1 Mio. € bei Entnahmen: 60 / 5 / 20 / 15 %.
              </p>
              <p className="vnote">
                Jede Stufe gilt automatisch ab ihrem Schwellenwert; die Voraussetzung ist ein
                Hinweis. Eine erreichte Stufe bleibt aktiv, bis die Anlagesumme an einem Monatsende
                10 % unter ihren Schwellenwert fällt. Sparraten werden hier nicht geändert.
              </p>
              {confirmExample && (
                <p role="alert">Die Vorlage ersetzt deine ungespeicherten Stufen und Quoten.</p>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  if (dirty && !confirmExample) {
                    setConfirmExample(true);
                    return;
                  }
                  try {
                    const template = wealthStageTemplate(exampleClasses);
                    changed();
                    setDynamic(true);
                    setSelected(0);
                    setLabel('Vermögensstufen');
                    setTiers(
                      template.map((t, i) => ({
                        limit: bpText(targetTierStarts(template)[i]!),
                        entries: entriesFor(view, t.targets),
                        label: t.label ?? '',
                        condition: t.condition ?? '',
                      })),
                    );
                    setConfirmExample(false);
                    setExampleOpen(false);
                  } catch (e) {
                    setErrors({ form: errorText(e) });
                  }
                }}
              >
                {confirmExample ? 'Stufen durch Beispielplan ersetzen' : 'Beispielplan übernehmen'}
              </Button>
            </details>

            <Field label="Vorlage">
              {({ id }) => (
                <Select
                  id={id}
                  defaultValue=""
                  onChange={(e) => {
                    const v = versions.find((v) => v.validFrom === e.target.value);
                    if (v) {
                      if (dirty) setWantedTemplate(v);
                      else load(v);
                    }
                  }}
                >
                  <option value="">Heute wirksame Quoten</option>
                  {versions.map((v) => (
                    <option key={v.validFrom} value={v.validFrom}>
                      Version ab {v.validFrom}
                      {v.label ? ' · ' + v.label : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {wantedTemplate && (
              <div role="alert" className="instrument-discard">
                <p>Ungespeicherte Änderungen durch diese Vorlage ersetzen?</p>
                <Button variant="ghost" onClick={() => setWantedTemplate(null)}>
                  Weiter bearbeiten
                </Button>
                <Button onClick={() => load(wantedTemplate)}>Vorlage laden</Button>
              </div>
            )}
            <p className="vnote">
              Ausgewählte Konten zählen einschließlich negativer Salden. Sollgewichte lösen keine
              Kauf- oder Verkaufsaufträge aus.
            </p>
          </div>
        </details>
        <div className={dynamic ? 'stage-version-fields' : undefined}>
          <Field label="Gültig ab" error={errors['date']}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="date"
                value={date}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  changed();
                  setDate(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Bezeichnung (optional)">
            {({ id }) => (
              <TextInput
                id={id}
                maxLength={80}
                value={label}
                onChange={(e) => {
                  changed();
                  setLabel(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Begründung (optional)">
            {({ id }) => (
              <TextInput
                id={id}
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  changed();
                  setReason(e.target.value);
                }}
              />
            )}
          </Field>
        </div>
        <p className="vnote">
          {versions.some((v) => v.validFrom === date)
            ? 'Die Version dieses Datums wird ersetzt.'
            : 'Eine neue Sollversion wird angelegt.'}{' '}
          Spätere Versionen bleiben erhalten. Zukünftige Versionen ändern heutige Ziele noch nicht.
        </p>
        {archiveClassId && (
          <p>
            Zum Archivieren diese Klasse in allen Stufen ausschließen. Historien- oder
            Cash-Abhängigkeiten können das Archivieren weiterhin verhindern.
          </p>
        )}
        <div className={dynamic ? 'stage-grid-tools' : undefined}>
          <label className="asset-check">
            <input
              type="checkbox"
              checked={dynamic}
              onChange={(e) => {
                changed();
                setDynamic(e.target.checked);
                setSelected(0);
                setTiers(
                  e.target.checked
                    ? [0, 1000000, 2000000, 5000000].map((limit) => ({
                        limit: bpText(limit),
                        entries: { ...tiers[0]!.entries },
                      }))
                    : [tiers[selected]!],
                );
              }}
            />
            Dynamische Stufen nach Anlagesumme
          </label>
          {dynamic && (
            <details className="stage-columns">
              <summary>Anlageklassenspalten</summary>
              <div className="stage-options-panel">
                {view.classes.map((c) => (
                  <label className="asset-check" key={c.id}>
                    <input
                      type="checkbox"
                      checked={visibleClasses.includes(c.id)}
                      onChange={(e) =>
                        setVisibleClasses(
                          e.target.checked
                            ? [...visibleClasses, c.id]
                            : visibleClasses.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name} anzeigen
                  </label>
                ))}
                <p className="vnote">
                  Spalten ändern keine gespeicherten Quoten oder die Berücksichtigung einer Klasse.
                </p>
              </div>
            </details>
          )}
        </div>
        {dynamic && (
          <section className="stage-grid-section" aria-label="Alle Vermögensstufen bearbeiten">
            <div className="stage-grid-tools">
              <p className="vnote">Bedingungen sind nur Hinweise. 10 % Puffer am Monatsende.</p>
            </div>
            <p className="vnote stage-saved-state">
              Gespeicherter Stand {longDay(view.asOf)} · Version{' '}
              {view.policy.targetValidFrom
                ? longDay(view.policy.targetValidFrom)
                : 'nicht vorhanden'}{' '}
              ·{' '}
              {savedStage === null
                ? 'Stufe nicht ermittelt'
                : `${view.policy.wealthStage?.label || `Stufe ${savedStage + 1}`} · ${view.policy.wealthStage?.inBuffer ? 'Puffer' : 'aktiv'}`}
              {!savedRows && ' · Eingaben sind noch nicht angewendet.'}
            </p>
            <table className="stage-grid" aria-label="Vermögensstufen">
              <thead>
                <tr>
                  <th className="stage-limit-col" scope="col">
                    Ab €
                  </th>
                  <th className="stage-name-col" scope="col">
                    Name
                  </th>
                  <th className="stage-status-col" scope="col">
                    Status
                  </th>
                  <th className="stage-action-col" scope="col">
                    Hinweis
                  </th>
                  {columns.map((c) => (
                    <th className="stage-share-col" key={c.id} scope="col">
                      {c.name} %
                    </th>
                  ))}
                  <th className="stage-sum-col" scope="col">
                    Summe
                  </th>
                  <th className="stage-action-col" scope="col">
                    Einfach
                  </th>
                  <th className="stage-action-col" scope="col">
                    Entfernen
                  </th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((row, index) => {
                  const rowErrors = Object.entries(errors).filter(
                    ([key]) =>
                      key === 'sum:' + index ||
                      key === 'limit:' + index ||
                      key.startsWith(index + ':'),
                  );
                  return (
                    <tr key={index} aria-label={`Stufe ${index + 1}`} data-stage-index={index}>
                      <td className="stage-main-cell">
                        <Field label={`Stufe ${index + 1} · Ab Vermögen (€)`}>
                          {({ id }) => (
                            <TextInput
                              id={id}
                              inputMode="decimal"
                              readOnly={index === 0}
                              value={index === 0 ? '0,00' : row.limit}
                              aria-invalid={Boolean(errors['limit:' + index])}
                              aria-describedby={
                                errors['limit:' + index] ? `${rowErrorPrefix}-${index}` : undefined
                              }
                              onChange={(e) => patchTier(index, { limit: e.target.value })}
                            />
                          )}
                        </Field>
                      </td>
                      <td>
                        <Field label={`Stufe ${index + 1} · Name (optional)`}>
                          {({ id }) => (
                            <TextInput
                              id={id}
                              maxLength={80}
                              value={row.label ?? ''}
                              onChange={(e) => patchTier(index, { label: e.target.value })}
                            />
                          )}
                        </Field>
                      </td>
                      <td className="stage-row-status">
                        <span className="stage-phone-label">Status</span>
                        {stageStatus(index)}
                      </td>
                      <td>
                        <details className="stage-cell-options">
                          <summary aria-label={`Stufe ${index + 1} · Bedingung bearbeiten`}>
                            …
                          </summary>
                          <div className="stage-options-panel">
                            <Field label={`Stufe ${index + 1} · Bedingung (nur Hinweis)`}>
                              {({ id }) => (
                                <TextInput
                                  id={id}
                                  maxLength={240}
                                  value={row.condition ?? ''}
                                  onChange={(e) => patchTier(index, { condition: e.target.value })}
                                />
                              )}
                            </Field>
                            <p className="vnote">
                              Die Stufe gilt ab ihrem Schwellenwert; diese Bedingung sperrt sie
                              nicht.
                            </p>
                          </div>
                        </details>
                      </td>
                      {columns.map((c) => {
                        const entry = row.entries[c.id]!;
                        const share = readBp(entry.share);
                        const band =
                          entry.bandMode === 'standard'
                            ? defaultBandBp(share ?? 0, view.policy.R13)
                            : readBp(entry.band);
                        return (
                          <td key={c.id}>
                            <div className="stage-share-cell">
                              {entry.included ? (
                                <Field label={c.name + ' · Soll (%)'}>
                                  {({ id }) => (
                                    <TextInput
                                      id={id}
                                      inputMode="decimal"
                                      maxLength={6}
                                      value={entry.share}
                                      aria-invalid={Boolean(errors[index + ':' + c.id + ':share'])}
                                      aria-describedby={
                                        errors[index + ':' + c.id + ':share']
                                          ? `${rowErrorPrefix}-${index}`
                                          : undefined
                                      }
                                      onChange={(e) =>
                                        update(c.id, { share: e.target.value }, index)
                                      }
                                    />
                                  )}
                                </Field>
                              ) : (
                                <span className="stage-unmanaged">{c.name}: unverwaltet</span>
                              )}
                              <details className="stage-cell-options">
                                <summary aria-label={`Stufe ${index + 1} · ${c.name} · Optionen`}>
                                  …
                                </summary>
                                <div className="stage-options-panel">
                                  <label className="asset-check">
                                    <input
                                      type="checkbox"
                                      checked={entry.included}
                                      onChange={(e) =>
                                        update(c.id, { included: e.target.checked }, index)
                                      }
                                    />
                                    Im Sollmodell berücksichtigen · {c.name}
                                  </label>
                                  {entry.included && (
                                    <>
                                      <Field label={c.name + ' · Band'}>
                                        {({ id }) => (
                                          <Select
                                            id={id}
                                            value={entry.bandMode}
                                            onChange={(e) =>
                                              update(
                                                c.id,
                                                {
                                                  bandMode:
                                                    e.target.value === 'custom'
                                                      ? 'custom'
                                                      : 'standard',
                                                },
                                                index,
                                              )
                                            }
                                          >
                                            <option value="standard">Standard</option>
                                            <option value="custom">Individuell</option>
                                          </Select>
                                        )}
                                      </Field>
                                      {entry.bandMode === 'custom' && (
                                        <Field label={c.name + ' · Band (Prozentpunkte)'}>
                                          {({ id }) => (
                                            <TextInput
                                              id={id}
                                              inputMode="decimal"
                                              value={entry.band}
                                              aria-invalid={Boolean(
                                                errors[index + ':' + c.id + ':band'],
                                              )}
                                              aria-describedby={
                                                errors[index + ':' + c.id + ':band']
                                                  ? `${rowErrorPrefix}-${index}`
                                                  : undefined
                                              }
                                              onChange={(e) =>
                                                update(c.id, { band: e.target.value }, index)
                                              }
                                            />
                                          )}
                                        </Field>
                                      )}
                                      <p className="vnote">
                                        Soll {bpText(share ?? 0)} % · Band ±
                                        {band === null ? 'nicht gültig' : bpText(band)}{' '}
                                        Prozentpunkte.
                                      </p>
                                    </>
                                  )}
                                </div>
                              </details>
                            </div>
                          </td>
                        );
                      })}
                      <td className="stage-row-sum" id={`${rowErrorPrefix}-${index}`}>
                        <span className="stage-phone-label">Summe</span>
                        <span aria-live="polite">{bpText(sums[index]!)} %</span>
                        {rowErrors.map(([key, message]) => (
                          <p className="field-error" role="alert" key={key}>
                            {maskMoneyText(message)}
                          </p>
                        ))}
                      </td>
                      <td>
                        <label className="stage-choose">
                          <input
                            type="radio"
                            name="stage-for-static"
                            checked={selected === index}
                            onChange={() => setSelected(index)}
                            aria-label={`Stufe ${index + 1} für einfache Sollquoten behalten`}
                          />
                          <span className="stage-phone-label">
                            Für einfache Sollquoten behalten
                          </span>
                        </label>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          aria-label={`Stufe ${index + 1} entfernen`}
                          disabled={index === 0 || tiers.length <= 1}
                          onClick={() => {
                            changed();
                            setTiers(tiers.filter((_, i) => i !== index));
                            setSelected(
                              selected === index ? 0 : selected > index ? selected - 1 : selected,
                            );
                          }}
                        >
                          −
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="stage-grid-tools">
              <Button
                variant="ghost"
                disabled={tiers.length >= 10}
                onClick={() => {
                  changed();
                  setSelected(tiers.length);
                  setTiers([
                    ...tiers,
                    { limit: '', entries: { ...tiers.at(-1)!.entries }, label: '', condition: '' },
                  ]);
                }}
              >
                Vermögensstufe hinzufügen
              </Button>
              <p className="vnote">
                Beim Abschalten der Stufen bleibt:{' '}
                {tiers[selected]?.label || `Stufe ${selected + 1}`}.
              </p>
            </div>
          </section>
        )}
        {!dynamic &&
          view.classes.map((c) => {
            const entry = tier.entries[c.id]!;
            const share = readBp(entry.share);
            const band =
              entry.bandMode === 'standard'
                ? defaultBandBp(share ?? 0, view.policy.R13)
                : (readBp(entry.band) ?? 0);
            return (
              <div className="asset-target-class" key={c.id}>
                <h3>{c.name}</h3>
                <p className="vnote">
                  Wertpapiere:{' '}
                  {c.assignedSecurities?.length
                    ? c.assignedSecurities.map((s) => s.name).join(', ')
                    : 'Noch keine zugeordnet'}
                  . Zuordnungen unter Anlageklassen bearbeiten.
                </p>
                <label className="asset-check">
                  <input
                    type="checkbox"
                    checked={entry.included}
                    onChange={(e) => update(c.id, { included: e.target.checked })}
                  />
                  Im Sollmodell berücksichtigen · {c.name}
                </label>
                {entry.included ? (
                  <>
                    <Field
                      label={c.name + ' · Soll (%)'}
                      error={errors[selected + ':' + c.id + ':share']}
                    >
                      {({ id, describedBy, invalid }) => (
                        <TextInput
                          id={id}
                          inputMode="decimal"
                          value={entry.share}
                          maxLength={6}
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          onChange={(e) => update(c.id, { share: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label={c.name + ' · Band'}>
                      {({ id }) => (
                        <Select
                          id={id}
                          value={entry.bandMode}
                          onChange={(e) =>
                            update(c.id, { bandMode: e.target.value as Entry['bandMode'] })
                          }
                        >
                          <option value="standard">Standard</option>
                          <option value="custom">Individuell</option>
                        </Select>
                      )}
                    </Field>
                    {entry.bandMode === 'custom' && (
                      <Field
                        label={c.name + ' · Band ± (Prozentpunkte)'}
                        error={errors[selected + ':' + c.id + ':band']}
                      >
                        {({ id, describedBy, invalid }) => (
                          <TextInput
                            id={id}
                            inputMode="decimal"
                            value={entry.band}
                            maxLength={6}
                            aria-invalid={invalid}
                            aria-describedby={describedBy}
                            onChange={(e) => update(c.id, { band: e.target.value })}
                          />
                        )}
                      </Field>
                    )}
                    <p className="vnote">
                      Soll {bpText(share ?? 0)} % · Band {bpText(Math.max(0, (share ?? 0) - band))}–
                      {bpText(Math.min(10000, (share ?? 0) + band))} %
                    </p>
                  </>
                ) : (
                  <p className="vnote">Ohne Sollquote · unverwaltet</p>
                )}
              </div>
            );
          })}
        {!dynamic && (
          <p className="target-total" aria-live="polite">
            Summe: {bpText(sums[selected]!)} % · erforderlich 100,00 %
          </p>
        )}
        {Object.entries(errors)
          .filter(([key]) => key === 'form' || key === 'sum')
          .map(([key, error]) => (
            <p key={key} className="field-error" role="alert">
              {maskMoneyText(error)}
            </p>
          ))}
        <Button type="submit">
          {busy
            ? 'Speichert …'
            : archiveClassId
              ? 'Sollversion speichern und archivieren'
              : 'Sollquoten speichern'}
        </Button>
      </fieldset>
    </form>
  );
}
