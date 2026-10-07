import {
  useAmountPrivacy,
  AmountInput,
  Button,
  FormDialog,
  Field,
  Segmented,
  Select,
} from '@budget/ui';
import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { AppLink } from '../shell/app-link';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { assign, moveMoney } from './budget-api';
import { CoverChoice, useCover } from './cover-choice';
import { STAGES, targetText } from './labels';
import {
  assignGuard,
  CLASS_TEXT,
  coverFromToBeAssigned,
  coverSourceLabel,
  freeCoverCents,
  coverSource,
  coverSources,
  isCard,
  moveGuard,
  readAssign,
  type PlanRow,
} from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/** Input form for assigning, moving and covering money; details live on the envelope page. */
export function EnvelopePanel({
  month,
  row,
  rows,
  toBeAssignedCents,
  onClose,
}: {
  month: string;
  row: PlanRow | undefined;
  rows: PlanRow[];
  toBeAssignedCents: number;
  onClose: () => void;
}) {
  useAmountPrivacy();
  return (
    <FormDialog open={row !== undefined} onClose={onClose} title={row?.name ?? ''}>
      {row && (
        <div className="bk-head">
          <h2>{row.name}</h2>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </div>
      )}
      <div className="bk-body">
        {row && (
          <EnvelopeBody
            key={`${month}:${row.id}`}
            month={month}
            row={row}
            rows={rows}
            tba={toBeAssignedCents}
            onDone={onClose}
          />
        )}
      </div>
    </FormDialog>
  );
}

export function EnvelopeBody({
  month,
  row: r,
  rows,
  tba,
  onDone,
}: {
  month: string;
  row: PlanRow;
  rows: PlanRow[];
  tba: number;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [amount, setAmount] = useState(formatDecimal(cents(r.assignedCents)));
  const [direction, setDirection] = useState<'in' | 'out'>(r.availableCents < 0 ? 'in' : 'out');
  const enough = coverSources(rows, r);
  const best = coverSource(rows, r);
  const suggested =
    r.overspentCents === 0 || (tba >= r.overspentCents && tba >= (best ? freeCoverCents(best) : 0))
      ? ''
      : (best?.id ?? 'none');
  const [chosenOther, setOther] = useState(suggested);
  const [explicitShort, setExplicitShort] = useState(false);
  const other =
    r.overspentCents > 0 &&
    ((chosenOther === '' && tba < r.overspentCents && !explicitShort) ||
      (chosenOther !== '' && !enough.some((o) => o.id === chosenOther)))
      ? suggested
      : chosenOther;
  const coverOptions = [
    ...enough,
    ...(tba >= r.overspentCents
      ? [{ id: '', name: 'Zu verteilen', availableCents: tba, freeCents: tba }]
      : []),
  ].sort((a, b) => freeCoverCents(b) - freeCoverCents(a));
  const [moveText, setMoveText] = useState('');
  const [error, setError] = useState<string>();
  const [moveError, setMoveError] = useState<string>();
  const [choosing, setChoosing] = useState(false);
  const others = rows.filter((o) => o.id !== r.id && !isCard(o));
  const fill = Math.min(r.needCents, Math.max(0, tba));
  const sourceFree =
    other === ''
      ? Math.max(0, tba)
      : freeCoverCents(rows.find((o) => o.id === other) ?? { availableCents: 0 });
  const cappedRest = Math.max(0, r.overspentCents - sourceFree);
  const name = (id: string) =>
    id === '' ? 'Zu verteilen' : (rows.find((o) => o.id === id)?.name ?? '');

  const run = async (fn: () => Promise<{ groupId: string }>, message: string) => {
    if (await write(fn, () => message)) onDone();
  };
  const coverFrom = useCover(month, name);
  /** Confirm only the capped amount when Zu verteilen is short. */
  const cover = async (confirmedCap = false) => {
    const short = other === '' && coverFromToBeAssigned(r.overspentCents, tba).short;
    if (!confirmedCap && short) return setChoosing(true);
    setChoosing(false);
    if (await coverFrom(r, other === '' ? null : other)) onDone();
  };
  const save = () => {
    // Absolute: the pre-filled figure (also a negative one) is the value, not a change.
    const value = readAssign(amount, r.assignedCents, false);
    if (value === null) return setError('Das lässt sich nicht als Betrag lesen.');
    if (value === r.assignedCents) return onDone();
    // The guard: no more than "Zu verteilen" holds; the message names the maximum.
    const guard = assignGuard(value, r.assignedCents, tba);
    if (!guard.ok) return setError(guard.message);
    void run(
      () => assign(month, [{ categoryId: r.id, assignedCents: value }]),
      `${r.name}: ${eur(r.assignedCents)} → ${eur(value)} zugewiesen`,
    );
  };
  const move = () => {
    const parsed = parseAmount(moveText);
    if (!parsed.ok || parsed.cents <= 0)
      return setMoveError('Bitte einen Betrag über 0 eintragen.');
    const src = other === '' ? null : other;
    const [from, to] = direction === 'in' ? [src, r.id] : [r.id, src];
    if (from === null) {
      const guard = moveGuard(parsed.cents, tba);
      if (!guard.ok) return setMoveError(guard.message);
    }
    void run(
      () => moveMoney(month, from, to, parsed.cents),
      `${eur(parsed.cents)} von ${from ? name(from) : 'Zu verteilen'} zu ${to ? name(to) : 'Zu verteilen'} verschoben`,
    );
  };

  return (
    <div className="kform">
      <h3 className="panel-h">Zuweisen</h3>
      <AmountInput
        label="Zugewiesen"
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setError(undefined);
        }}
        error={error}
      />
      <div className="panel-actions">
        <Button onClick={save}>Übernehmen</Button>
        {fill > 0 && (
          <Button
            variant="ghost"
            onClick={() =>
              void run(
                () => assign(month, [{ categoryId: r.id, assignedCents: r.assignedCents + fill }]),
                `${r.name}: Ziel mit ${eur(fill)} gefüllt`,
              )
            }
          >
            Ziel füllen · {eur(fill)}
          </Button>
        )}
      </div>

      <h3 className="panel-h">
        {r.overspentCents > 0 ? 'Decken oder verschieben' : 'Geld verschieben'}
      </h3>
      <Segmented
        label="Richtung"
        stretch
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'in', label: 'Hierher' },
          { value: 'out', label: 'Von hier weg' },
        ]}
      />
      <Field label={direction === 'in' ? 'Aus' : 'Nach'}>
        {({ id }) => (
          <Select
            id={id}
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
              setExplicitShort(e.target.value === '' && tba < r.overspentCents);
              setChoosing(false);
            }}
          >
            {r.overspentCents > 0 && direction === 'in' ? (
              <>
                {other === 'none' && (
                  <option value="none" disabled>
                    Keine Quelle hat freies Geld
                  </option>
                )}
                {tba > 0 && tba < r.overspentCents && (
                  <option value="">Zu verteilen · {eur(tba)} · reicht nicht vollständig</option>
                )}
              </>
            ) : (
              <option value="">Zu verteilen · {eur(tba)}</option>
            )}
            {(r.overspentCents > 0 && direction === 'in' ? coverOptions : others).map((o) => (
              <option key={o.id} value={o.id}>
                {o.id === '' || r.overspentCents === 0 || direction !== 'in'
                  ? `${o.name} · ${eur(o.availableCents)}`
                  : coverSourceLabel(o)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {r.overspentCents > 0 && (
        <p className="panel-sub" data-testid="cover-remaining">
          {other === 'none'
            ? 'Keine Quelle hat freies Geld zum Decken.'
            : other !== '' || tba >= r.overspentCents
              ? `aus ${name(other)} · bleibt ${eur(Math.max(0, sourceFree - r.overspentCents))}${cappedRest > 0 ? ` · ${eur(cappedRest)} bleiben offen (auf freies Geld begrenzt)` : ''}`
              : `Zu verteilen reicht nicht · ${eur(Math.max(0, r.overspentCents - Math.max(0, tba)))} fehlen`}
        </p>
      )}
      <AmountInput
        label="Betrag"
        value={moveText}
        onChange={(v) => {
          setMoveText(v);
          setMoveError(undefined);
        }}
        error={moveError}
      />
      <div className="panel-actions">
        <Button variant="ghost" onClick={move} disabled={other === 'none'}>
          Verschieben
        </Button>
        {r.overspentCents > 0 && (
          <Button
            variant={r.cashOverspentCents > 0 ? 'alert' : 'ghost'}
            disabled={other === 'none'}
            onClick={() => void cover()}
          >
            Decken · {eur(r.overspentCents)}
          </Button>
        )}
      </div>
      {choosing && (
        <CoverChoice
          overspentCents={r.overspentCents}
          toBeAssignedCents={tba}
          onCover={() => void cover(true)}
          onCancel={() => setChoosing(false)}
        />
      )}
    </div>
  );
}

/** Read-only envelope figures reused as the detail page body. */
export function EnvelopeDetails({ month, row: r }: { month: string; row: PlanRow }) {
  useAmountPrivacy();
  return (
    <div className="kform">
      <div className={r.cashOverspentCents > 0 ? 'big neg-alert' : 'big'}>
        {eur(r.availableCents)}
      </div>
      <p className="panel-sub">
        Verfügbar im {monthLabel(month).split(' ')[0]}
        {r.cls && ` · ${CLASS_TEXT[r.cls]}`}
        {r.stage && ` · Stufe ${r.stage} ${STAGES[r.stage - 1]?.name}`}
      </p>
      <dl className="kv-list">
        <div className="kv">
          <dt>Übertrag</dt>
          <dd>{eur(r.carryCents)}</dd>
        </div>
        <div className="kv">
          <dt>Zugewiesen</dt>
          <dd>{eur(r.assignedCents, { sign: true })}</dd>
        </div>
        <div className="kv">
          <dt>Aktivität</dt>
          <dd>{eur(r.activityCents)}</dd>
        </div>
        <div className="kv kv-total">
          <dt>= Verfügbar</dt>
          <dd>{eur(r.availableCents)}</dd>
        </div>
        {r.creditOverspentCents > 0 && (
          <div className="kv">
            <dt>davon neue Kartenschuld</dt>
            <dd className="debt-val">{eur(r.creditOverspentCents)}</dd>
          </div>
        )}
      </dl>

      <h3 className="panel-h">Ziel</h3>
      <p className="panel-sub">
        {r.target ? targetText(r.target) : 'Kein Ziel.'}{' '}
        <AppLink to="/einstellungen/kategorien">In Einstellungen › Kategorien ändern</AppLink>
      </p>
    </div>
  );
}
