import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select, TextInput, useToast } from '@budget/ui';
import type { FreedomGoalChange, FreedomGoalRate, FreedomGoalState } from '@budget/domain';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { eur } from '../ledger/format';
import { changeFreedomGoal, FREEDOM_GOAL_KEY } from './freedom-api';

export interface FreedomGoalRequest {
  state: FreedomGoalState | undefined;
  pending: boolean;
  error: boolean;
  refresh: () => Promise<FreedomGoalState | undefined>;
}

const valueFor = (state: FreedomGoalState | undefined, mode: 'year' | 'age') => {
  const value = mode === 'year' ? state?.goalYear : state?.goalAge;
  return value === null || value === undefined ? '' : String(value);
};

/** A personal preference; this never changes the current saving/return scenario or any booking. */
export function FreedomGoalForm({
  request,
  rate,
}: {
  request: FreedomGoalRequest;
  rate: FreedomGoalRate;
}) {
  const { state } = request;
  const [mode, setMode] = useState<'year' | 'age'>('year');
  const [draft, setDraft] = useState<{
    raw: string;
    revision: string | undefined;
    ageRevision: string | undefined;
  } | null>(null);
  // Pristine fields derive from saved state. Editing captures the original CAS tokens once,
  // so a background refresh cannot silently attach another writer's revision to the draft.
  const raw = draft?.raw ?? valueFor(state, mode);
  const dirty = draft !== null;
  const base = draft ?? { revision: state?.revision, ageRevision: state?.ageRevision };
  const [writing, setWriting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  const offerUndo = (groupId: string) =>
    toast.show({
      message: 'Persönliches Ziel gespeichert.',
      actionLabel: 'Rückgängig',
      onAction: () =>
        void undoGroup(groupId).then(
          async (undone) => {
            await request.refresh();
            toast.show({
              message: 'Zieländerung rückgängig gemacht.',
              actionLabel: 'Wiederholen',
              onAction: () =>
                void undoGroup(undone.groupId).then(request.refresh, (cause: unknown) =>
                  toast.show({ message: errorText(cause) }),
                ),
            });
          },
          (cause: unknown) => toast.show({ message: errorText(cause) }),
        ),
    });
  const write = async (change: FreedomGoalChange) => {
    if (!state || state.unavailable || !base.revision || writing || reloading) return;
    setWriting(true);
    setError('');
    try {
      const saved = await changeFreedomGoal(base.revision, change);
      queryClient.setQueryData(FREEDOM_GOAL_KEY, saved);
      setDraft(null);
      if (saved.changed) offerUndo(saved.groupId);
      else toast.show({ message: 'Das Ziel ist unverändert.' });
    } catch (cause) {
      setError(`${errorText(cause)} Deine Eingabe bleibt erhalten.`);
      // Refresh the visible saved state, but do not replace the draft's stale CAS token.
      await request.refresh();
    } finally {
      setWriting(false);
    }
  };
  const reload = async () => {
    if (writing || reloading) return;
    setReloading(true);
    try {
      const latest = await request.refresh();
      if (!latest || latest.unavailable) {
        setError('Aktueller Stand konnte nicht geladen werden. Deine Eingabe bleibt erhalten.');
        return;
      }
      setDraft((current) => ({
        raw: current?.raw ?? raw,
        revision: latest.revision,
        ageRevision: latest.ageRevision,
      }));
      setError(
        'Aktueller Stand geladen. Deine Eingabe bleibt erhalten; du kannst erneut speichern.',
      );
    } catch {
      setError('Aktueller Stand konnte nicht geladen werden. Deine Eingabe bleibt erhalten.');
    } finally {
      setReloading(false);
    }
  };
  const save = () => {
    if (!/^\d+$/.test(raw.trim())) {
      setError('Bitte eine ganze Zahl eingeben.');
      return;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      setError('Die Eingabe liegt außerhalb des gültigen Bereichs.');
      return;
    }
    void write(
      mode === 'year'
        ? { kind: 'year', year: value }
        : { kind: 'age', age: value, ageRevision: base.ageRevision ?? 'none' },
    );
  };
  return (
    <div
      className="freedom-personal-goal"
      role="group"
      aria-labelledby="freedom-personal-goal-title"
    >
      <h3 id="freedom-personal-goal-title">Persönliches Ziel</h3>
      {request.pending && <p role="status">Persönliches Ziel wird geladen …</p>}
      {request.error && <p role="alert">Das gespeicherte Ziel konnte nicht geladen werden.</p>}
      {state?.unavailable && (
        <p role="alert">
          Das gespeicherte Ziel ist nicht verfügbar und bleibt unverändert erhalten.
        </p>
      )}
      <fieldset disabled={!state || state.unavailable || writing}>
        <legend className="sr-only">Ziel bis Alter / Jahr</legend>
        <div className="freedom-goal-fields">
          <Field label="Ziel bis">
            {({ id }) => (
              <Select
                id={id}
                value={mode}
                disabled={reloading}
                onChange={(event) => {
                  setMode(event.target.value as 'year' | 'age');
                  setDraft(null);
                  setError('');
                }}
              >
                <option value="year">Jahr (Jänner)</option>
                <option value="age" disabled={!state?.ageAvailable}>
                  Alter im Kalenderjahr
                </option>
              </Select>
            )}
          </Field>
          <Field label={mode === 'year' ? 'Zieljahr' : 'Alter im Kalenderjahr'}>
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                autoComplete="off"
                value={raw}
                onChange={(event) => {
                  setDraft({
                    raw: event.target.value,
                    revision: base.revision,
                    ageRevision: base.ageRevision,
                  });
                }}
              />
            )}
          </Field>
        </div>
        <p className="vnote">
          Zielmonat ist Jänner. Das Alter bezeichnet das im Zieljahr erreichte Alter, nicht einen
          Geburtstag als Termin.
        </p>
        {!state?.ageAvailable && (
          <p className="vnote">
            Für die Alterseingabe fehlt ein vollständiges Geburtsdatum im Profil. Das Zieljahr
            kannst du trotzdem speichern.
          </p>
        )}
        <div className="freedom-goal-actions">
          <Button variant="primary" onClick={save} disabled={writing || reloading}>
            Ziel speichern
          </Button>
          <Button
            variant="ghost"
            onClick={() => void write({ kind: 'clear' })}
            disabled={writing || reloading || state?.goalYear === null}
          >
            Ziel entfernen
          </Button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {(error || request.error) && (
        <Button variant="ghost" onClick={() => void reload()} disabled={writing || reloading}>
          Aktuellen Stand laden
        </Button>
      )}
      {reloading && <p role="status">Aktueller Stand wird geladen …</p>}
      {dirty && (
        <p className="vnote">
          Ungespeicherte Eingabe · die Berechnung verwendet das gespeicherte Ziel.
        </p>
      )}
      {state && !state.unavailable && state.goalYear !== null && (
        <div className="kv">
          <span>Nötige Sparrate für {state.goalYear}</span>
          <strong data-testid="freedom-required-saving">
            {rate.status === 'available' && rate.monthlySavingCents !== null
              ? `${eur(rate.monthlySavingCents)} / Monat`
              : rate.status === 'missed'
                ? 'Zielmonat vorbei · Ziel nicht erreicht'
                : 'nicht berechenbar'}
          </strong>
        </div>
      )}
      {state && state.goalYear === null && !state.unavailable && (
        <p className="vnote">Noch kein persönliches Ziel gespeichert.</p>
      )}
    </div>
  );
}
