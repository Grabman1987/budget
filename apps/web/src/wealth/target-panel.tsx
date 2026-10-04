import { defaultBandBp, parseScaledDecimal, type ManagedTarget } from '@budget/domain';
import { Button, DetailPanel, Field, Select, TextInput, maskMoneyText } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { useAssetWrite } from '../pages/asset-classes-api';
import type { PortfolioAllocationView, TargetVersion } from './allocation-api';

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
    <DetailPanel
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
    </DetailPanel>
  );
}
type Entry = { included: boolean; share: string; bandMode: 'standard' | 'custom'; band: string };
type TierDraft = { limit: string; entries: Record<string, Entry> };
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
  const initial = versions.filter((v) => v.validFrom <= view.asOf).at(-1);
  const [date, setDate] = useState(view.asOf),
    [label, setLabel] = useState(initial?.label ?? ''),
    [reason, setReason] = useState(initial?.reason ?? '');
  const [tiers, setTiers] = useState<TierDraft[]>(() =>
    initial?.tiers.length
      ? initial.tiers.map((t) => ({
          limit: t.upToCents === null ? '' : bpText(t.upToCents),
          entries: entriesFor(view, t.targets),
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
  const update = (id: string, patch: Partial<Entry>) => {
    changed();
    setTiers(
      tiers.map((t, i) =>
        i !== selected
          ? t
          : { ...t, entries: { ...t.entries, [id]: { ...t.entries[id]!, ...patch } } },
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
        ? v.tiers.map((t) => ({
            limit: t.upToCents === null ? '' : bpText(t.upToCents),
            entries: entriesFor(view, t.targets),
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
        nextErrors['sum'] =
          'Stufe ' +
          (i + 1) +
          ': Die Sollquoten ergeben ' +
          bpText(sums[i]!) +
          ' %. Erforderlich sind genau 100,00 %.';
      let upToCents: number | null = null;
      if (dynamic && i < tiers.length - 1) {
        const raw = tier.limit.trim().replace(',', '.');
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(raw))
          nextErrors['limit:' + i] = 'Bitte eine positive Stufengrenze in Euro eingeben.';
        else upToCents = parseScaledDecimal(raw, 2);
        if (!upToCents)
          nextErrors['limit:' + i] = 'Bitte eine positive Stufengrenze in Euro eingeben.';
      }
      return { upToCents, targets };
    });
    for (let i = 1; i < prepared.length - 1; i++)
      if (prepared[i]!.upToCents! <= prepared[i - 1]!.upToCents!)
        nextErrors['limit:' + i] = 'Stufengrenzen müssen aufsteigend sein.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const bad = Object.keys(nextErrors).find((k) => /^\d+:/.test(k));
      if (bad) setSelected(Number(bad.split(':')[0]));
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
            tiers: dynamic ? prepared : [],
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
                  ? [1000000, 2000000, 5000000, null].map((limit) => ({
                      limit: limit === null ? '' : bpText(limit),
                      entries: { ...tiers[0]!.entries },
                    }))
                  : [tiers[selected]!],
              );
            }}
          />
          Dynamische Stufen nach Anlagesumme
        </label>
        {dynamic && (
          <>
            <p className="vnote">
              Depots + Anlage-Cash einschließlich negativer Salden. Die Grenze gehört zur
              niedrigeren Stufe; jedes Monatsende wählt seine eigene Stufe.
            </p>
            <Field label="Stufe bearbeiten">
              {({ id }) => (
                <Select
                  id={id}
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {tiers.map((t, i) => (
                    <option key={i} value={i}>
                      {i === tiers.length - 1 ? 'Darüber' : 'Bis ' + t.limit + ' €'}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {selected < tiers.length - 1 && (
              <Field label="Stufengrenze (€)" error={errors['limit:' + selected]}>
                {({ id, invalid, describedBy }) => (
                  <TextInput
                    id={id}
                    inputMode="decimal"
                    value={tier.limit}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => {
                      changed();
                      setTiers(
                        tiers.map((t, i) => (i === selected ? { ...t, limit: e.target.value } : t)),
                      );
                    }}
                  />
                )}
              </Field>
            )}
            <div className="asset-actions">
              <Button
                variant="ghost"
                disabled={tiers.length >= 10}
                onClick={() => {
                  changed();
                  setSelected(tiers.length - 1);
                  setTiers([
                    ...tiers.slice(0, -1),
                    { limit: '', entries: { ...tiers.at(-1)!.entries } },
                    tiers.at(-1)!,
                  ]);
                }}
              >
                Stufe hinzufügen
              </Button>
              <Button
                variant="ghost"
                disabled={tiers.length <= 2 || selected === tiers.length - 1}
                onClick={() => {
                  changed();
                  setTiers(tiers.filter((_, i) => i !== selected));
                  setSelected(0);
                }}
              >
                Stufe entfernen
              </Button>
            </div>
          </>
        )}
        {view.classes.map((c) => {
          const entry = tier.entries[c.id]!;
          const share = readBp(entry.share);
          const band =
            entry.bandMode === 'standard'
              ? defaultBandBp(share ?? 0, view.policy.R13)
              : (readBp(entry.band) ?? 0);
          return (
            <div className="asset-target-class" key={c.id}>
              <h3>{c.name}</h3>
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
        <p className="target-total" aria-live="polite">
          Summe: {bpText(sums[selected]!)} % · erforderlich 100,00 %
        </p>
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
