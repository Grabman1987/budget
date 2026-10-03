import {
  useAmountPrivacy,
  AmountInput,
  Button,
  DetailPanel,
  Field,
  Segmented,
  Select,
  Switch,
  TextInput,
  maskMoneyText,
} from '@budget/ui';
import { cents, formatDecimal, parseAmount, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { accountsQuery } from '../ledger/queries';
import { eur, longDay } from '../ledger/format';
import {
  CATEGORY_KINDS,
  CLASSLESS_KINDS,
  createCategory,
  createGroup,
  fetchSplitOff,
  mergeCategories,
  patchCategory,
  renameGroup,
  splitOff,
  type CategoryClass,
  type CategoryKind,
  type CategoryRow,
  type CategoryTree,
  type GroupRow,
  type TargetKind,
} from './api';
import { budgetQuery } from './budget-api';
import { CategoryIcon } from './category-icon';
import { KIND_LABEL, RHYTHM_LABEL, STAGES } from './labels';
import { useBudgetWrite } from './use-category-writes';

export type PanelState =
  | null
  | { mode: 'edit'; groupId: string; category?: CategoryRow }
  | { mode: 'group'; group?: GroupRow }
  | { mode: 'merge'; category: CategoryRow }
  | { mode: 'split'; category: CategoryRow };

const TITLE = {
  edit: 'Kategorie',
  group: 'Gruppe',
  merge: 'Zusammenführen',
  split: 'Buchungen abspalten',
} as const;

/** Side panel (desktop) / bottom sheet (phone) of Einstellungen › Kategorien. */
export function CategoryPanel({
  state,
  tree,
  onClose,
  onSwitch,
}: {
  state: PanelState;
  tree: CategoryTree;
  onClose: () => void;
  onSwitch: (next: PanelState) => void;
}) {
  useAmountPrivacy();
  const title =
    state?.mode === 'edit' && !state.category
      ? 'Kategorie anlegen'
      : state?.mode === 'group' && !state.group
        ? 'Gruppe anlegen'
        : state
          ? TITLE[state.mode]
          : '';
  return (
    <DetailPanel open={state !== null} onClose={onClose} title={title}>
      {state?.mode === 'edit' && (
        <CategoryForm
          key={state.category?.id ?? 'new'}
          state={state}
          tree={tree}
          onDone={onClose}
          onSwitch={onSwitch}
        />
      )}
      {state?.mode === 'group' && <GroupForm group={state.group} onDone={onClose} />}
      {state?.mode === 'merge' && (
        <MergeForm source={state.category} tree={tree} onDone={onClose} />
      )}
      {state?.mode === 'split' && (
        <SplitForm source={state.category} tree={tree} onDone={onClose} />
      )}
    </DetailPanel>
  );
}

function GroupForm({ group, onDone }: { group: GroupRow | undefined; onDone: () => void }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [name, setName] = useState(group?.name ?? '');
  // A second Enter while the first write runs must not rename or create twice.
  const busy = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const done = group
      ? await write(
          () => renameGroup(group.id, name),
          () => `Gruppe heißt jetzt „${name.trim()}“.`,
        )
      : await write(
          () => createGroup(name),
          () => `Gruppe „${name.trim()}“ angelegt.`,
        );
    busy.current = false;
    if (done) onDone();
  };
  return (
    <form className="kform" onSubmit={(e) => void submit(e)}>
      <Field label="Name">
        {({ id }) => (
          <TextInput
            id={id}
            value={name}
            required
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <div className="panel-actions">
        <Button type="submit" disabled={name.trim() === ''}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

const month = () => todayInVienna().slice(0, 7);
type TargetChoice = 'none' | TargetKind;

function CategoryForm({
  state,
  tree,
  onDone,
  onSwitch,
}: {
  state: { groupId: string; category?: CategoryRow };
  tree: CategoryTree;
  onDone: () => void;
  onSwitch: (next: PanelState) => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const cards = accounts.filter((a) => a.type === 'credit_card' && !a.closedAt);
  const c = state.category;
  // A card payment envelope follows its card: kind and card are fixed (the server refuses both).
  const locked = c?.kind === 'card_payment';
  const versions = tree.targets.filter((t) => t.categoryId === c?.id);
  const current = versions[versions.length - 1];
  const [name, setName] = useState(c?.name ?? '');
  const [icon, setIcon] = useState(c?.icon ?? '');
  const [groupId, setGroupId] = useState(c?.groupId ?? state.groupId);
  const [kind, setKind] = useState<CategoryKind>(c?.kind ?? 'variable');
  const [cls, setCls] = useState<CategoryClass>(c?.class ?? 'need');
  const [stage, setStage] = useState(c?.stage ? String(c.stage) : '');
  const [card, setCard] = useState(c?.cardAccountId ?? cards[0]?.id ?? '');
  const [hidden, setHidden] = useState(Boolean(c?.hiddenAt));
  const [targetKind, setTargetKind] = useState<TargetChoice>(current?.kind ?? 'none');
  const [amount, setAmount] = useState(current ? formatDecimal(cents(current.amountCents)) : '');
  const [every, setEvery] = useState(String(current?.everyMonths ?? 1));
  const [dueDay, setDueDay] = useState(current?.dueDay ? String(current.dueDay) : '');
  const [dueDate, setDueDate] = useState(current?.targetDate ?? '');
  const [error, setError] = useState<string>();
  const classless = CLASSLESS_KINDS.has(kind);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = targetKind === 'none' ? null : parseAmount(amount || '0');
    if (parsed && !parsed.ok) return setError('Der Zielbetrag lässt sich nicht ausrechnen.');
    if (targetKind === 'by_date' && !dueDate) return setError('Bitte das Zieldatum wählen.');
    setError(undefined);
    const fields = {
      name,
      groupId,
      icon: icon.trim() || null,
      class: classless ? null : cls,
      stage: stage ? Number(stage) : null,
      ...(!locked && { kind, cardAccountId: kind === 'card_payment' ? card || null : null }),
    };
    const target =
      parsed && targetKind !== 'none'
        ? {
            kind: targetKind,
            amountCents: parsed.cents,
            everyMonths: targetKind === 'monthly' ? Number(every) : 1,
            targetDate: targetKind === 'by_date' || Number(every) > 1 ? dueDate || null : null,
            dueDay: targetKind === 'monthly' && dueDay ? Number(dueDay) : null,
          }
        : null;
    // The target is written with the category (one audit group) only when it changed.
    const was = current && {
      kind: current.kind,
      amountCents: current.amountCents,
      everyMonths: current.everyMonths,
      targetDate: current.targetDate,
      dueDay: current.dueDay,
    };
    const changed = JSON.stringify(target) !== JSON.stringify(was ?? null);
    const withTarget = changed ? { target: { validFrom: month(), target } } : {};
    const done = await write(
      () =>
        c
          ? patchCategory(c.id, { ...fields, hidden, ...withTarget })
          : createCategory({ ...fields, ...withTarget }),
      (r) => (c ? `„${r.category.name}“ gespeichert.` : `Kategorie „${r.category.name}“ angelegt.`),
    );
    if (done) onDone();
  };

  return (
    <form className="kform" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Name">
        {({ id }) => (
          <TextInput
            id={id}
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Symbol (ein Emoji, einfarbig dargestellt)"
        hint={
          <>
            Vorschau: <CategoryIcon icon={icon.trim() || null} />
          </>
        }
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            value={icon}
            maxLength={16}
            aria-describedby={describedBy}
            className="emoji-input"
            onChange={(e) => setIcon(e.target.value)}
          />
        )}
      </Field>
      <Field label="Gruppe">
        {({ id }) => (
          <Select id={id} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {tree.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {locked ? (
        <div className="field-row">
          <dl className="kv-list">
            <div className="kv">
              <dt>Art</dt>
              <dd>{KIND_LABEL.card_payment}</dd>
            </div>
            <div className="kv">
              <dt>Kreditkarte</dt>
              <dd>{accounts.find((a) => a.id === c.cardAccountId)?.name ?? '–'}</dd>
            </div>
          </dl>
          <p className="field-hint">
            Eine Kartenzahlung gehört fest zu ihrer Karte: Art und Karte lassen sich nicht ändern.
          </p>
        </div>
      ) : (
        <Field label="Art">
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
              {CATEGORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {!classless && (
        <div className="field-row">
          <span className="field-label">Klasse</span>
          <Segmented
            label="Klasse"
            stretch
            value={cls}
            onChange={setCls}
            options={[
              { value: 'need', label: 'Bedarf' },
              { value: 'want', label: 'Wunsch' },
              { value: 'future', label: 'Zukunft' },
            ]}
          />
        </div>
      )}
      {kind === 'card_payment' && !locked && (
        <Field
          label="Kreditkarte"
          hint={cards.length === 0 ? 'Lege zuerst ein Kreditkartenkonto an.' : undefined}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              value={card}
              aria-describedby={describedBy}
              onChange={(e) => setCard(e.target.value)}
            >
              {cards.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Stufe im Wasserfall">
        {({ id }) => (
          <Select id={id} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">keine Stufe</option>
            {STAGES.map((s) => (
              <option key={s.n} value={s.n}>
                {s.n} · {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="kform-set">
        <legend>Ziel</legend>
        <Field label="Art des Ziels">
          {({ id }) => (
            <Select
              id={id}
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as TargetChoice)}
            >
              <option value="none">kein Ziel</option>
              <option value="monthly">Betrag im Rhythmus</option>
              <option value="by_date">Betrag bis Datum</option>
              <option value="keep_balance">Guthaben halten</option>
            </Select>
          )}
        </Field>
        {targetKind !== 'none' && (
          <AmountInput label="Betrag" value={amount} onChange={setAmount} />
        )}
        {targetKind === 'monthly' && (
          <Field label="Rhythmus">
            {({ id }) => (
              <Select id={id} value={every} onChange={(e) => setEvery(e.target.value)}>
                {Object.entries(RHYTHM_LABEL).map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {targetKind === 'monthly' && every === '1' && (
          <Field label="Fällig am (Tag im Monat)">
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={dueDay}
                placeholder="1"
                onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            )}
          </Field>
        )}
        {(targetKind === 'by_date' || (targetKind === 'monthly' && every !== '1')) && (
          <Field label={targetKind === 'by_date' ? 'Zieldatum' : 'Nächste Fälligkeit'}>
            {({ id }) => (
              <TextInput
                id={id}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            )}
          </Field>
        )}
      </fieldset>
      {c && (
        <div className="kform-switch">
          <span id="cat-hidden-label">
            Ausblenden
            <small>Die Kategorie behält ihr Geld und zählt weiter in jeder Zahl.</small>
          </span>
          <Switch labelledBy="cat-hidden-label" checked={hidden} onChange={setHidden} />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
      <div className="panel-actions">
        <Button type="submit" disabled={name.trim() === ''}>
          Speichern
        </Button>
        {c && c.kind !== 'card_payment' && (
          <Button variant="ghost" onClick={() => onSwitch({ mode: 'merge', category: c })}>
            Zusammenführen …
          </Button>
        )}
        {c && c.splitCount > 0 && (
          <Button variant="ghost" onClick={() => onSwitch({ mode: 'split', category: c })}>
            Abspalten …
          </Button>
        )}
      </div>
    </form>
  );
}

function MergeForm({
  source,
  tree,
  onDone,
}: {
  source: CategoryRow;
  tree: CategoryTree;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  // Never into a card payment; into an income category only from income (spending would turn
  // into "Zu verteilen").
  const others = tree.categories.filter(
    (c) =>
      c.id !== source.id &&
      c.kind !== 'card_payment' &&
      (c.kind !== 'income' || source.kind === 'income'),
  );
  const [targetId, setTargetId] = useState(others[0]?.id ?? '');
  const target = others.find((c) => c.id === targetId);
  const thisMonth = month();
  const overspent =
    useQuery(budgetQuery(thisMonth)).data?.summary.envelopes.find((e) => e.categoryId === source.id)
      ?.overspentCents ?? 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const done = await write(
      () => mergeCategories([source.id], targetId),
      (r) =>
        `„${source.name}“ in „${target?.name ?? ''}“ zusammengeführt (${r.movedSplits} Buchungen).`,
    );
    if (done) onDone();
  };
  return (
    <form className="kform" onSubmit={(e) => void submit(e)}>
      <p className="panel-sub">
        Alle {source.splitCount} Buchungen, die Zuweisungen aller Monate und das Startguthaben von „
        {source.name}“ wandern in die gewählte Kategorie. „{source.name}“ verschwindet danach. Ein
        Klick auf „Rückgängig“ stellt alles wieder her.
      </p>
      <Field
        label="Zusammenführen in"
        hint={`Kartenzahlungen${source.kind === 'income' ? '' : ' und Einnahmen'} stehen nicht zur Wahl.`}
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            value={targetId}
            aria-describedby={describedBy}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {tree.groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {others
                  .filter((c) => c.groupId === g.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.hiddenAt ? ' (ausgeblendet)' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      {target?.hiddenAt && (
        <p className="panel-sub" role="note">
          „{target.name}“ ist ausgeblendet und bleibt es nach dem Zusammenführen. Blende sie danach
          ein, wenn „{source.name}“ sichtbar weiterlaufen soll.
        </p>
      )}
      {target && overspent > 0 && (
        <p className="panel-sub" role="note">
          „{source.name}“ ist diesen Monat um {eur(overspent)} überzogen. Nach dem Zusammenführen
          verrechnet sich das mit dem Geld von „{target.name}“: Was in den nächsten Monat übertragen
          wird, ändert sich (wie in YNAB).
        </p>
      )}
      <div className="panel-actions">
        <Button type="submit" disabled={!target}>
          Zusammenführen
        </Button>
      </div>
    </form>
  );
}

function SplitForm({
  source,
  tree,
  onDone,
}: {
  source: CategoryRow;
  tree: CategoryTree;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [into, setInto] = useState('new');
  const [name, setName] = useState('');
  const found = useQuery({
    queryKey: ['categories', 'split-off', source.id, q, from, to],
    queryFn: () => fetchSplitOff(source.id, { q, from, to }),
  });
  const splits = found.data?.splits ?? [];
  const chosen = picked ?? new Set(splits.map((s) => s.splitId));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const sum = splits.filter((s) => chosen.has(s.splitId)).reduce((a, s) => a + s.amountCents, 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target =
      into === 'new'
        ? {
            newCategory: {
              name,
              groupId: source.groupId,
              kind: source.kind,
              class: source.class,
              stage: source.stage,
              icon: null,
            },
          }
        : { targetId: into };
    const done = await write(
      () => splitOff(source.id, [...chosen], target),
      (r) => `${r.moved} Buchungen verschoben.`,
    );
    if (done) onDone();
  };
  return (
    <form className="kform" onSubmit={(e) => void submit(e)}>
      <p className="panel-sub">
        Wähle Buchungen aus „{source.name}“, die in eine andere oder neue Kategorie wandern. Die
        Zuweisungen bleiben, wo sie sind; Geld verschiebst du danach in Plan › Monat.
      </p>
      <Field label="Suchtext (Empfänger, Notiz)">
        {({ id }) => (
          <TextInput
            id={id}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
          />
        )}
      </Field>
      <div className="kform-pair">
        <Field label="Von">
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPicked(null);
              }}
            />
          )}
        </Field>
        <Field label="Bis">
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPicked(null);
              }}
            />
          )}
        </Field>
      </div>
      <fieldset className="kform-set split-list">
        <legend>
          {chosen.size} von {splits.length} Buchungen · {eur(sum)}
        </legend>
        {splits.map((s) => (
          <label key={s.splitId} className="split-row">
            <input
              type="checkbox"
              checked={chosen.has(s.splitId)}
              onChange={() => toggle(s.splitId)}
            />
            <span>{longDay(s.date)}</span>
            <span className="split-payee">{s.payeeName ?? s.memo ?? '—'}</span>
            <span className="kc-num">{eur(s.amountCents)}</span>
          </label>
        ))}
      </fieldset>
      <Field label="Wohin">
        {({ id }) => (
          <Select id={id} value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="new">Neue Kategorie in derselben Gruppe</option>
            {tree.categories
              .filter((c) => c.id !== source.id && c.kind !== 'card_payment')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        )}
      </Field>
      {into === 'new' && (
        <Field label="Name der neuen Kategorie">
          {({ id }) => (
            <TextInput
              id={id}
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      )}
      <div className="panel-actions">
        <Button
          type="submit"
          disabled={chosen.size === 0 || (into === 'new' && name.trim() === '')}
        >
          Abspalten
        </Button>
      </div>
    </form>
  );
}
