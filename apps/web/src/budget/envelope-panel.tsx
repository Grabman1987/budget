import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { AmountInput, Button, DetailPanel, Field, Segmented, Select } from '@budget/ui';
import { AppLink } from '../shell/app-link';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { assign, coverOverspending, moveMoney } from './budget-api';
import { STAGES, targetText } from './labels';
import { CLASS_TEXT, coverSource, isCard, type PlanRow } from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/** Side panel (desktop) / bottom sheet (phone) of one envelope: figures, assign, move, cover. */
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
  return (
    <DetailPanel open={row !== undefined} onClose={onClose} title={row?.name ?? ''}>
      {row && (
        <EnvelopeBody
          key={row.id}
          month={month}
          row={row}
          rows={rows}
          tba={toBeAssignedCents}
          onDone={onClose}
        />
      )}
    </DetailPanel>
  );
}

function EnvelopeBody({
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
  const write = useBudgetWrite();
  const [amount, setAmount] = useState(formatDecimal(cents(r.assignedCents)));
  const [direction, setDirection] = useState<'in' | 'out'>(r.availableCents < 0 ? 'in' : 'out');
  const [other, setOther] = useState(coverSource(rows, r)?.id ?? '');
  const [moveText, setMoveText] = useState('');
  const [error, setError] = useState<string>();
  const others = rows.filter((o) => o.id !== r.id && !isCard(o));
  const fill = Math.min(r.needCents, Math.max(0, tba));
  const name = (id: string) =>
    id === '' ? 'Zu verteilen' : (rows.find((o) => o.id === id)?.name ?? '');

  const run = async (fn: () => Promise<{ groupId: string }>, message: string) => {
    if (await write(fn, () => message)) onDone();
  };
  const save = () => {
    const parsed = parseAmount(amount);
    if (!parsed.ok || parsed.cents < 0) return setError('Das lässt sich nicht als Betrag lesen.');
    if (parsed.cents === r.assignedCents) return onDone();
    void run(
      () => assign(month, [{ categoryId: r.id, assignedCents: parsed.cents }]),
      `${r.name}: ${eur(r.assignedCents)} → ${eur(parsed.cents)} zugewiesen`,
    );
  };
  const move = () => {
    const parsed = parseAmount(moveText);
    if (!parsed.ok || parsed.cents <= 0) return setError('Bitte einen Betrag über 0 eintragen.');
    const src = other === '' ? null : other;
    const [from, to] = direction === 'in' ? [src, r.id] : [r.id, src];
    void run(
      () => moveMoney(month, from, to, parsed.cents),
      `${eur(parsed.cents)} von ${from ? name(from) : 'Zu verteilen'} zu ${to ? name(to) : 'Zu verteilen'} verschoben`,
    );
  };

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

      <h3 className="panel-h">Zuweisen</h3>
      <AmountInput label="Zugewiesen" value={amount} onChange={setAmount} error={error} />
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
          <Select id={id} value={other} onChange={(e) => setOther(e.target.value)}>
            <option value="">Zu verteilen · {eur(tba)}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {eur(o.availableCents)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <AmountInput label="Betrag" value={moveText} onChange={setMoveText} />
      <div className="panel-actions">
        <Button variant="ghost" onClick={move}>
          Verschieben
        </Button>
        {r.overspentCents > 0 && (
          <Button
            variant={r.cashOverspentCents > 0 ? 'alert' : 'ghost'}
            onClick={() =>
              void run(
                () => coverOverspending(month, r.id, other === '' ? null : other),
                `${r.name} aus ${name(other)} gedeckt`,
              )
            }
          >
            Decken · {eur(r.overspentCents)}
          </Button>
        )}
      </div>

      <h3 className="panel-h">Ziel</h3>
      <p className="panel-sub">
        {r.target ? targetText(r.target) : 'Kein Ziel.'}{' '}
        <AppLink to="/einstellungen/kategorien">In Einstellungen › Kategorien ändern</AppLink>
      </p>
    </div>
  );
}
