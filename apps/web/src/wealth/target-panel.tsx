import { parseScaledDecimal } from '@budget/domain';
import {
  Button,
  DetailPanel,
  Field,
  Select,
  TextInput,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { request } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import {
  targetVersionsQuery,
  type PortfolioAllocationView,
  type TargetVersion,
} from './allocation-api';

type Draft = { validFrom: string; shares: Record<string, string>; bands: Record<string, number> };
const bpText = (bp: number) => (bp / 100).toFixed(2).replace('.', ',');
const readBp = (value: string) => {
  const raw = value.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const bp = parseScaledDecimal(raw, 2);
  return bp >= 0 && bp <= 10_000 ? bp : null;
};
function draftFor(view: PortfolioAllocationView, versions: TargetVersion[], day: string): Draft {
  const rows = new Map(
    versions
      .filter((version) => version.validFrom <= day)
      .flatMap((version) => version.targets.map((row) => [row.assetClassId, row] as const)),
  );
  return {
    validFrom: day,
    shares: Object.fromEntries(
      view.classes.map((cls) => [cls.id, bpText(rows.get(cls.id)?.targetShareBp ?? 0)]),
    ),
    bands: Object.fromEntries(view.classes.map((cls) => [cls.id, rows.get(cls.id)?.bandBp ?? 0])),
  };
}

export function TargetPanel({
  open,
  onClose,
  view,
  onRetry,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  view: PortfolioAllocationView | undefined;
  onRetry: () => void;
  pending: boolean;
  error: unknown;
}) {
  useAmountPrivacy();
  const versions = useQuery({ ...targetVersionsQuery(), enabled: open });
  const dirtyRef = useRef({ target: false, cls: false });
  const busyRef = useRef(false);
  const blockedDuringSave = useRef(false);
  const setTargetDirty = useCallback((value: boolean) => {
    dirtyRef.current.target = value;
  }, []);
  const setClassDirty = useCallback((value: boolean) => {
    dirtyRef.current.cls = value;
  }, []);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const setBusyNow = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (busyRef.current) blockedDuringSave.current = true;
      return busyRef.current || dirtyRef.current.target || dirtyRef.current.cls;
    },
    withResolver: true,
    enableBeforeUnload: () => busyRef.current || dirtyRef.current.target || dirtyRef.current.cls,
  });
  const { status, reset } = blocker;
  useEffect(() => {
    if (status !== 'blocked') return;
    if (blockedDuringSave.current || busyRef.current) {
      blockedDuringSave.current = false;
      setAsking(false);
      reset();
      return;
    }
    setAsking(true);
  }, [status, reset, busy]);
  const close = () => {
    setTargetDirty(false);
    setClassDirty(false);
    setAsking(false);
    setBusyNow(false);
    onClose();
  };
  return (
    <DetailPanel
      open={open}
      title="Sollquoten bearbeiten"
      onClose={close}
      beforeClose={() => {
        if (busyRef.current || blocker.status === 'blocked') return false;
        if (!dirtyRef.current.target && !dirtyRef.current.cls) return true;
        setAsking(true);
        return false;
      }}
    >
      {(pending || versions.isPending) && <LoadingNote what="Sollquoten" />}
      {!!error && <ErrorNote what="Anlageklassen" error={error} onRetry={onRetry} />}
      {versions.isError && (
        <ErrorNote
          what="Zielversionen"
          error={versions.error}
          onRetry={() => void versions.refetch()}
        />
      )}
      {view && !error && versions.data && !versions.isError && (
        <TargetEditor
          view={view}
          versions={versions.data.versions}
          onDirty={setTargetDirty}
          onClassDirty={setClassDirty}
          onBusy={setBusyNow}
          onSaved={close}
        />
      )}
      {asking && (
        <div className="instrument-discard" role="alert">
          <p>Ungespeicherte Sollquoten oder Klassenangaben verwerfen?</p>
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
              if (blocker.status === 'blocked') {
                setTargetDirty(false);
                setClassDirty(false);
                setAsking(false);
                blocker.proceed();
              } else close();
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
    </DetailPanel>
  );
}
function TargetEditor({
  view,
  versions,
  onDirty,
  onClassDirty,
  onBusy,
  onSaved,
}: {
  view: PortfolioAllocationView;
  versions: TargetVersion[];
  onDirty: (value: boolean) => void;
  onClassDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  onSaved: () => void;
}) {
  useAmountPrivacy();
  const [original, setOriginal] = useState(() => draftFor(view, versions, view.asOf));
  const [draft, setDraft] = useState(original);
  const [template, setTemplate] = useState(view.asOf);
  const [wantedTemplate, setWantedTemplate] = useState<string>();
  const [className, setClassName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const saving = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const shares = view.classes.map((cls) => readBp(draft.shares[cls.id] ?? '0'));
  const sum = shares.some((value) => value === null)
    ? null
    : shares.reduce<number>((a, value) => a + (value ?? 0), 0);
  const update = (next: Draft) => {
    setDraft(next);
    setError(undefined);
    onDirty(JSON.stringify(next) !== JSON.stringify(original));
  };
  const load = (day: string) => {
    const next = draftFor(view, versions, day);
    setDraft(next);
    setOriginal(next);
    setTemplate(day);
    setWantedTemplate(undefined);
    onDirty(false);
    setError(undefined);
  };
  const reverse = (groupId: string, redo = false) =>
    void undoGroup(groupId).then(
      async (result) => {
        await qc.invalidateQueries();
        toast.show({
          message: redo ? 'Wiederholt.' : 'Rückgängig gemacht.',
          actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
          onAction: () => reverse(result.groupId, !redo),
        });
      },
      (reason: unknown) =>
        toast.show({
          message: `${redo ? 'Wiederholen' : 'Rückgängig'} nicht möglich. ${errorText(reason)}`,
        }),
    );
  const write = async (event: FormEvent, createClass = false) => {
    event.preventDefault();
    if (saving.current) return;
    if (
      createClass
        ? !className.trim()
        : sum !== 10_000 || view.classes.length === 0 || view.classes.length > 50
    ) {
      setError(
        createClass
          ? 'Namen für die Anlageklasse eingeben.'
          : 'Sollquoten müssen zusammen genau 100,00 % ergeben (höchstens 50 Klassen).',
      );
      return;
    }
    if (
      !createClass &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(draft.validFrom) ||
        Number.isNaN(Date.parse(draft.validFrom)) ||
        new Date(draft.validFrom).toISOString().slice(0, 10) !== draft.validFrom)
    ) {
      setError('Gültiges Kalenderdatum eingeben.');
      return;
    }
    saving.current = true;
    setBusy(true);
    onBusy(true);
    setError(undefined);
    try {
      const result = await request<{ groupId: string }>(
        createClass ? 'POST' : 'PUT',
        createClass ? '/api/asset-classes' : '/api/asset-classes/targets',
        createClass
          ? { name: className.trim() }
          : {
              validFrom: draft.validFrom,
              targets: view.classes.map((cls, i) => ({
                assetClassId: cls.id,
                targetShareBp: shares[i]!,
                bandBp: draft.bands[cls.id] ?? 0,
              })),
            },
      );
      toast.show({
        message: createClass ? 'Anlageklasse angelegt.' : 'Sollquoten gespeichert.',
        actionLabel: 'Rückgängig',
        onAction: () => reverse(result.groupId),
      });
      if (createClass) {
        setClassName('');
        onClassDirty(false);
      } else {
        setOriginal(draft);
        onDirty(false);
        if (!className) onSaved();
      }
      await qc.invalidateQueries();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <>
      <form className="kform" onSubmit={(event) => void write(event)}>
        <fieldset className="target-fields" disabled={busy}>
          <Field label="Vorlage">
            {({ id }) => (
              <Select
                id={id}
                value={template}
                onChange={(event) =>
                  dirty ? setWantedTemplate(event.target.value) : load(event.target.value)
                }
              >
                <option value={view.asOf}>Heute wirksame Quoten ({view.asOf})</option>
                {versions
                  .filter((version) => version.validFrom !== view.asOf)
                  .map((version) => (
                    <option key={version.validFrom} value={version.validFrom}>
                      Version ab {version.validFrom}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          {wantedTemplate && (
            <div className="instrument-discard" role="alert">
              <p>Geänderte Quoten verwerfen und diese Vorlage laden?</p>
              <Button variant="ghost" onClick={() => setWantedTemplate(undefined)}>
                Weiter bearbeiten
              </Button>
              <Button onClick={() => load(wantedTemplate)}>Vorlage laden</Button>
            </div>
          )}
          <Field
            label="Gültig ab"
            hint="Ein Datumswechsel übernimmt die eingegebenen Quoten für dieses Datum."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                type="date"
                required
                value={draft.validFrom}
                aria-describedby={describedBy}
                onChange={(event) => update({ ...draft, validFrom: event.target.value })}
              />
            )}
          </Field>
          <p className="vnote">
            {versions.some((version) => version.validFrom === draft.validFrom)
              ? 'Die vorhandene Version dieses Datums wird ersetzt.'
              : 'Eine neue Zielversion wird angelegt.'}{' '}
            {draft.validFrom < view.asOf
              ? 'Rückdatierung kann die heute wirksamen Ziele ändern.'
              : draft.validFrom > view.asOf
                ? 'Zukünftige Ziele ändern die heutige Aufteilung noch nicht.'
                : ''}{' '}
            Spätere Versionen bleiben erhalten.
          </p>
          {view.classes.map((cls) => (
            <Field
              key={cls.id}
              label={`${cls.name} · Soll (%)`}
              hint={
                draft.bands[cls.id]
                  ? `Gespeichertes Band ±${bpText(draft.bands[cls.id]!)} Prozentpunkte bleibt erhalten.`
                  : 'Band nach R13: kleinerer Wert aus 5 Prozentpunkten und 25 % des Solls.'
              }
            >
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  value={draft.shares[cls.id] ?? '0,00'}
                  inputMode="decimal"
                  maxLength={6}
                  aria-describedby={describedBy}
                  onChange={(event) =>
                    update({ ...draft, shares: { ...draft.shares, [cls.id]: event.target.value } })
                  }
                />
              )}
            </Field>
          ))}
          <p className="target-total" aria-live="polite">
            Summe: {sum === null ? 'Angaben prüfen' : `${bpText(sum)} %`} · erforderlich 100,00 %
          </p>
          <Button type="submit" disabled={view.classes.length === 0 || view.classes.length > 50}>
            {busy ? 'Speichert …' : 'Sollquoten speichern'}
          </Button>
        </fieldset>
      </form>
      <form className="kform target-class-create" onSubmit={(event) => void write(event, true)}>
        <fieldset className="target-fields" disabled={busy}>
          <h3>Anlageklasse anlegen</h3>
          <Field label="Name der Anlageklasse">
            {({ id }) => (
              <TextInput
                id={id}
                value={className}
                required
                maxLength={80}
                onChange={(event) => {
                  setClassName(event.target.value);
                  onClassDirty(!!event.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          <Button variant="ghost" type="submit">
            Anlageklasse anlegen
          </Button>
        </fieldset>
      </form>
      {!!error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
    </>
  );
}
