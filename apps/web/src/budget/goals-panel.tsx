import {
  useAmountPrivacy,
  AmountInput,
  Button,
  DetailPanel,
  DimensionChain,
  Field,
  Segmented,
  Select,
  TextInput,
  type DimensionChainTerm,
} from '@budget/ui';
import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { useState } from 'react';
import { AccountOptions } from '../ledger/account-options';
import { eur, longDay } from '../ledger/format';
import type { AccountRow } from '../ledger/types';
import { AppLink } from '../shell/app-link';
import type { CategoryRow, GroupRow } from './api';
import { adoptGoal, createGoal, deleteGoal, patchGoal, type GoalView } from './goals-api';
import { goalLine, shortMonth } from './goals-model';
import { useBudgetWrite } from './use-category-writes';

export type GoalPanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; id: string };

/** Categories a goal can save in: not income, card payments or cash advances. */
const SAVABLE = (c: CategoryRow) =>
  c.hiddenAt === null && c.kind !== 'income' && c.kind !== 'card_payment' && c.kind !== 'advance';

/** Side panel (desktop) / bottom sheet (phone) of one goal: figures, edit, adopt, delete. */
export function GoalPanel({
  month,
  state,
  goal,
  categories,
  groups,
  accounts,
  onClose,
}: {
  month: string;
  state: GoalPanelState;
  goal: GoalView | undefined;
  categories: CategoryRow[];
  groups: GroupRow[];
  accounts: AccountRow[];
  onClose: () => void;
}) {
  useAmountPrivacy();
  const creating = state.mode === 'create';
  const shown = state.mode === 'closed' || (state.mode === 'edit' && !goal) ? false : true;
  return (
    <DetailPanel
      open={shown}
      onClose={onClose}
      title={creating ? 'Neues Sparziel' : (goal?.name ?? '')}
    >
      {shown && (
        <GoalBody
          key={goal?.id ?? 'new'}
          month={month}
          goal={goal}
          categories={categories}
          groups={groups}
          accounts={accounts}
          onDone={onClose}
        />
      )}
    </DetailPanel>
  );
}

function GoalBody({
  month,
  goal,
  categories,
  groups,
  accounts,
  onDone,
}: {
  month: string;
  goal: GoalView | undefined;
  categories: CategoryRow[];
  groups: GroupRow[];
  accounts: AccountRow[];
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? formatDecimal(cents(goal.targetCents)) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [link, setLink] = useState<'category' | 'account'>(
    goal?.accountId ? 'account' : 'category',
  );
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [errors, setErrors] = useState<{ name?: string; target?: string; link?: string }>({});

  const category = categories.find((c) => c.id === (goal?.categoryId ?? ''));
  const savable = categories.filter(SAVABLE);
  const open = accounts.filter((a) => a.closedAt === null);

  const save = async () => {
    const parsed = parseAmount(target);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = 'Bitte einen Namen eintragen.';
    if (!parsed.ok || parsed.cents <= 0) next.target = 'Bitte ein Ziel über 0 eintragen.';
    if (link === 'category' ? categoryId === '' : accountId === '')
      next.link = link === 'category' ? 'Bitte eine Kategorie wählen.' : 'Bitte ein Konto wählen.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;
    const values = {
      name: name.trim(),
      targetCents: parsed.cents,
      targetDate: date === '' ? null : date,
      categoryId: link === 'category' ? categoryId : null,
      accountId: link === 'account' ? accountId : null,
    };
    if (!goal) {
      if (
        await write(
          () => createGoal(month, values),
          () => `Sparziel „${values.name}“ angelegt`,
        )
      )
        onDone();
      return;
    }
    const changed = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => goal[k as keyof typeof values] !== v),
    );
    if (Object.keys(changed).length === 0) return onDone();
    if (
      await write(
        () => patchGoal(month, goal.id, changed),
        () => `${values.name} geändert`,
      )
    )
      onDone();
  };

  return (
    <div className="kform goal-form">
      {goal && <GoalFigures goal={goal} month={month} category={category} />}
      <h3 className="panel-h">{goal ? 'Bearbeiten' : 'Sparziel'}</h3>
      <Field label="Name" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            value={name}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <AmountInput label="Ziel" value={target} onChange={setTarget} error={errors.target} />
      <Field label="Zieldatum" hint="Ohne Datum gibt es keine nötige Monatsrate.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            type="date"
            value={date}
            aria-describedby={describedBy}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      <Segmented
        label="Verknüpft mit"
        stretch
        value={link}
        onChange={setLink}
        options={[
          { value: 'category', label: 'Kategorie' },
          { value: 'account', label: 'Konto' },
        ]}
      />
      {link === 'category' ? (
        <Field label="Kategorie" error={errors.link}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={categoryId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Bitte wählen</option>
              {groups.map((g) => {
                const list = savable.filter((c) => c.groupId === g.id);
                return list.length === 0 ? null : (
                  <optgroup key={g.id} label={g.name}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          )}
        </Field>
      ) : (
        <Field label="Konto" error={errors.link}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={accountId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Bitte wählen</option>
              <AccountOptions accounts={open} />
            </Select>
          )}
        </Field>
      )}
      <div className="panel-actions">
        <Button onClick={() => void save()}>{goal ? 'Speichern' : 'Anlegen'}</Button>
        {goal && (
          <Button
            variant="ghost"
            onClick={() =>
              void write(
                () => deleteGoal(goal.id),
                () => `Sparziel „${goal.name}“ gelöscht`,
              ).then((done) => done && onDone())
            }
          >
            Löschen
          </Button>
        )}
      </div>

      {goal && category && (
        <>
          <h3 className="panel-h">Ziel der Kategorie</h3>
          <p className="panel-sub">
            {goal.targetDate
              ? `${category.name} bekommt das Ziel ${eur(goal.targetCents)} bis ${shortMonth(goal.targetDate.slice(0, 7))}, gültig ab ${shortMonth(month)}. Plan › Monat verteilt dann danach.`
              : 'Für ein Ziel der Kategorie braucht das Sparziel ein Zieldatum.'}
          </p>
          <div className="panel-actions">
            <Button
              variant="ghost"
              disabled={!goal.targetDate}
              onClick={() =>
                void write(
                  () => adoptGoal(goal.id, month),
                  () => `${category.name}: Ziel ${eur(goal.targetCents)} übernommen`,
                )
              }
            >
              Als Ziel der Kategorie übernehmen
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Gespart + Fehlt = Ziel, then the figures behind the needed rate and the forecast. */
function GoalFigures({
  goal: g,
  month,
  category,
}: {
  goal: GoalView;
  month: string;
  category: CategoryRow | undefined;
}) {
  useAmountPrivacy();
  const extra = Math.max(0, g.savedCents - g.targetCents);
  const terms: DimensionChainTerm[] = [
    { label: 'Gespart', value: cents(g.savedCents - extra) },
    { label: 'Fehlt', value: cents(g.remainingCents), op: '+' },
    { label: 'Ziel', value: cents(g.targetCents), op: '=' },
  ];
  const line = goalLine(g, month);
  return (
    <>
      <DimensionChain terms={terms} precision="cent" label="Maßkette Sparziel" />
      <p className="panel-sub">
        {line.text}
        {extra > 0 && ` · ${eur(extra)} mehr als das Ziel`}
      </p>
      <dl className="kv-list">
        <div className="kv">
          <dt>Envelope</dt>
          <dd>
            {category ? (
              <AppLink to="/plan/monat" search={(prev) => ({ ...prev, monat: month })}>
                {category.name}
              </AppLink>
            ) : (
              'Konto'
            )}
          </dd>
        </div>
        <div className="kv">
          <dt>Zieldatum</dt>
          <dd>{g.targetDate ? longDay(g.targetDate) : 'ohne Datum'}</dd>
        </div>
        <div className="kv">
          <dt>Monate bis dahin</dt>
          <dd>{g.monthsLeft ?? '–'}</dd>
        </div>
        <div className="kv">
          <dt>Nötige Rate</dt>
          <dd>{g.neededMonthlyCents === null ? '–' : eur(g.neededMonthlyCents)}</dd>
        </div>
        <div className="kv">
          <dt>Ø letzte 3 Monate</dt>
          <dd>{eur(g.averageRateCents)}</dd>
        </div>
        <div className="kv kv-total">
          <dt>Prognose</dt>
          <dd>
            {g.forecastMonth
              ? shortMonth(g.forecastMonth)
              : g.status === 'reached'
                ? 'erreicht'
                : '–'}
          </dd>
        </div>
      </dl>
    </>
  );
}
