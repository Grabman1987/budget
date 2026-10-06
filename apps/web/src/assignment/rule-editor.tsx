import {
  assignmentRuleSchema,
  cents,
  formatDecimal,
  parseAmount,
  type AssignmentActions,
  type AssignmentCondition,
  type AssignmentRuleInput,
} from '@budget/domain';
import { Button, Field, FormDialog, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { accountsQuery, lookupsQuery, payeesQuery } from '../ledger/queries';
import { AccountOptions } from '../ledger/account-options';
import { errorText } from '../ledger/labels';
import '../assignment/assignment.css';

type ConditionDraft = {
  type: AssignmentCondition['type'];
  value: string;
  min: string;
  max: string;
};
const conditionDraft = (c: AssignmentCondition): ConditionDraft => ({
  type: c.type,
  value:
    c.type === 'payee'
      ? c.payeeId
      : c.type === 'account'
        ? c.accountId
        : c.type === 'contains' || c.type === 'counterparty'
          ? c.text
          : c.type === 'regex'
            ? c.pattern
            : c.type === 'direction'
              ? c.direction
              : '',
  min: c.type === 'amount' && c.minCents !== undefined ? formatDecimal(cents(c.minCents)) : '',
  max: c.type === 'amount' && c.maxCents !== undefined ? formatDecimal(cents(c.maxCents)) : '',
});
const INITIAL: AssignmentRuleInput = {
  name: '',
  enabled: true,
  automatic: false,
  match: { mode: 'all', conditions: [{ type: 'contains', text: '' }] },
  actions: { categoryId: null },
};
const LABELS = {
  counterparty: 'Gegenpart genau',
  payee: 'Empfänger',
  contains: 'Banktext enthält',
  regex: 'Banktext als Muster',
  amount: 'Betragsbereich',
  account: 'Konto',
  direction: 'Richtung',
};
const amount = (text: string) => {
  const parsed = parseAmount(text);
  if (!parsed.ok) throw new RangeError('Betrag prüfen. Beispiel: −12,50 oder 25,00.');
  return parsed.cents;
};

export function AssignmentEditor({
  initial,
  id,
  onClose,
}: {
  initial?: AssignmentRuleInput | undefined;
  id?: string | undefined;
  onClose: () => void;
}) {
  const seed = initial ?? INITIAL;
  const trigger = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(
    () => () => {
      const target = trigger.current;
      queueMicrotask(() => {
        if (target?.isConnected) target.focus();
      });
    },
    [],
  );
  const [name, setName] = useState(seed.name),
    [mode, setMode] = useState(seed.match.mode);
  const [conditions, setConditions] = useState(seed.match.conditions.map(conditionDraft));
  const [actions, setActions] = useState<AssignmentActions>(seed.actions);
  const [enabled, setEnabled] = useState(seed.enabled),
    [automatic, setAutomatic] = useState(seed.automatic);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    count: number;
    examples: { id: string; date: string; amountCents: number; rawText: string }[];
  } | null>(null);
  const lookups = useQuery(lookupsQuery()),
    payees = useQuery(payeesQuery()),
    accounts = useQuery(accountsQuery());
  const write = useBudgetWrite();
  const change = (i: number, patch: Partial<ConditionDraft>) => {
    setConditions((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setPreview(null);
  };
  const setAction = (key: keyof AssignmentActions, value: unknown) => {
    setActions((a) => {
      const next = { ...a, [key]: value };
      if (value === undefined) delete next[key];
      return next;
    });
    setPreview(null);
  };
  const draft = (): AssignmentRuleInput =>
    assignmentRuleSchema.parse({
      name,
      enabled,
      automatic,
      actions: Object.fromEntries(
        Object.entries(actions).filter(([, value]) => value !== undefined),
      ),
      match: {
        mode,
        conditions: conditions.map((c) => {
          switch (c.type) {
            case 'payee':
              return { type: c.type, payeeId: c.value };
            case 'account':
              return { type: c.type, accountId: c.value };
            case 'contains':
            case 'counterparty':
              return { type: c.type, text: c.value };
            case 'regex':
              return { type: c.type, pattern: c.value };
            case 'direction':
              return { type: c.type, direction: c.value };
            case 'amount':
              return {
                type: c.type,
                ...(c.min ? { minCents: amount(c.min) } : {}),
                ...(c.max ? { maxCents: amount(c.max) } : {}),
              };
          }
        }),
      },
    });
  const fail = (e: unknown) =>
    setError(
      e instanceof Error && 'issues' in e
        ? 'Bedingungen und Aktionen prüfen. Split-Anteile müssen 100 % ergeben. Muster: keine Gruppen; höchstens eine Wiederholung mit ^ am Anfang und ohne |.'
        : errorText(e),
    );
  const test = async () => {
    setError('');
    setBusy(true);
    try {
      setPreview(await request('POST', '/api/assignment-rules/preview', draft()));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setError('');
    let input: AssignmentRuleInput;
    try {
      input = draft();
    } catch (e) {
      fail(e);
      return;
    }
    setBusy(true);
    const result = await write(
      () =>
        request<{ groupId: string }>(
          id ? 'PUT' : 'POST',
          '/api/assignment-rules' + (id ? '/' + encodeURIComponent(id) : ''),
          input,
        ),
      () => 'Zuordnungsregel gespeichert.',
    );
    setBusy(false);
    if (result) onClose();
  };
  const categories = lookups.data?.categories.filter((c) => c.kind !== 'card_payment') ?? [];
  return (
    <FormDialog
      open
      onClose={onClose}
      title={id ? 'Zuordnungsregel bearbeiten' : 'Zuordnungsregel erstellen'}
    >
      <form
        className="assignment-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="assignment-editor-head">
          <h3>{id ? 'Regel bearbeiten' : 'Regel erstellen'}</h3>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
        </div>
        <div className="assignment-editor-body">
          <fieldset disabled={busy}>
            <Field label="Regelname">
              {({ id }) => (
                <TextInput
                  id={id}
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPreview(null);
                  }}
                />
              )}
            </Field>
            <Field label="Bedingungen verknüpfen">
              {({ id }) => (
                <Select
                  id={id}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setPreview(null);
                  }}
                >
                  <option value="all">Alle Bedingungen</option>
                  <option value="any">Beliebige Bedingung</option>
                </Select>
              )}
            </Field>
            {conditions.map((c, i) => (
              <fieldset className="assignment-condition" key={i}>
                <legend>Bedingung {i + 1}</legend>
                <Field label={`Art der Bedingung ${i + 1}`}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={c.type}
                      onChange={(e) =>
                        change(i, {
                          type: e.target.value as ConditionDraft['type'],
                          value: e.target.value === 'direction' ? 'outflow' : '',
                          min: '',
                          max: '',
                        })
                      }
                    >
                      {Object.entries(LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {c.type === 'payee' || c.type === 'account' || c.type === 'direction' ? (
                  <Field label={`${LABELS[c.type]} ${i + 1}`}>
                    {({ id }) => (
                      <Select
                        id={id}
                        required
                        value={c.value}
                        onChange={(e) => change(i, { value: e.target.value })}
                      >
                        <option value="">Bitte wählen</option>
                        {(c.type === 'payee'
                          ? payees.data?.payees.filter((p) => !p.systemKind)
                          : c.type === 'account'
                            ? accounts.data?.accounts.filter((a) => !a.closedAt)
                            : [
                                { id: 'outflow', name: 'Ausgabe' },
                                { id: 'inflow', name: 'Einnahme' },
                              ]
                        )?.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ) : c.type === 'amount' ? (
                  <div className="assignment-grid">
                    <Field label="Betrag von (€, mit Vorzeichen)">
                      {({ id }) => (
                        <TextInput
                          id={id}
                          inputMode="decimal"
                          value={c.min}
                          onChange={(e) => change(i, { min: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Betrag bis (€, mit Vorzeichen)">
                      {({ id }) => (
                        <TextInput
                          id={id}
                          inputMode="decimal"
                          value={c.max}
                          onChange={(e) => change(i, { max: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                ) : (
                  <Field label={c.type === 'regex' ? 'Muster' : 'Text'}>
                    {({ id }) => (
                      <TextInput
                        id={id}
                        required
                        maxLength={200}
                        value={c.value}
                        onChange={(e) => change(i, { value: e.target.value })}
                      />
                    )}
                  </Field>
                )}
                {c.type === 'regex' && (
                  <p className="text-muted">
                    Beispiel: ^Shop.* · Keine Gruppen; höchstens eine Wiederholung (*, + oder ?) mit
                    ^ am Anfang und ohne |.
                  </p>
                )}
                <Button
                  variant="ghost"
                  disabled={conditions.length === 1}
                  onClick={() => {
                    setConditions((rows) => rows.filter((_, n) => n !== i));
                    setPreview(null);
                  }}
                >
                  Bedingung {i + 1} entfernen
                </Button>
              </fieldset>
            ))}
            <Button
              variant="ghost"
              disabled={conditions.length >= 12}
              onClick={() => {
                setConditions((rows) => [
                  ...rows,
                  { type: 'contains', value: '', min: '', max: '' },
                ]);
                setPreview(null);
              }}
            >
              Bedingung hinzufügen
            </Button>
            <fieldset>
              <legend>Aktionen</legend>
              <Field label="Empfänger setzen">
                {({ id }) => (
                  <Select
                    id={id}
                    value={actions.payeeId === undefined ? '' : (actions.payeeId ?? 'clear')}
                    onChange={(e) =>
                      setAction(
                        'payeeId',
                        e.target.value === ''
                          ? undefined
                          : e.target.value === 'clear'
                            ? null
                            : e.target.value,
                      )
                    }
                  >
                    <option value="">Keine Änderung</option>
                    <option value="clear">Empfänger entfernen</option>
                    {payees.data?.payees
                      .filter((p) => !p.systemKind)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="Kategorie setzen">
                {({ id }) => (
                  <Select
                    id={id}
                    disabled={!!actions.splits}
                    value={actions.categoryId === undefined ? '' : (actions.categoryId ?? 'clear')}
                    onChange={(e) =>
                      setAction(
                        'categoryId',
                        e.target.value === ''
                          ? undefined
                          : e.target.value === 'clear'
                            ? null
                            : e.target.value,
                      )
                    }
                  >
                    <option value="">Keine Änderung</option>
                    <option value="clear">Ohne Kategorie / Zu verteilen</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <label className="assignment-check">
                <input
                  type="checkbox"
                  checked={!!actions.splits}
                  onChange={(e) => {
                    setActions((a) =>
                      e.target.checked
                        ? {
                            ...a,
                            categoryId: undefined,
                            transferAccountId: undefined,
                            splits: [
                              { categoryId: categories[0]?.id ?? '', weightBp: 5000 },
                              { categoryId: categories[1]?.id ?? '', weightBp: 5000 },
                            ],
                          }
                        : { ...a, splits: undefined },
                    );
                    setPreview(null);
                  }}
                />
                Split-Vorlage verwenden
              </label>
              {actions.splits?.map((s, i) => (
                <div className="assignment-grid" key={i}>
                  <Field label={`Split ${i + 1}: Kategorie`}>
                    {({ id }) => (
                      <Select
                        id={id}
                        value={s.categoryId}
                        onChange={(e) =>
                          setAction(
                            'splits',
                            actions.splits?.map((r, n) =>
                              n === i ? { ...r, categoryId: e.target.value } : r,
                            ),
                          )
                        }
                      >
                        <option value="">Bitte wählen</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={`Split ${i + 1}: Anteil (%)`}>
                    {({ id }) => (
                      <TextInput
                        id={id}
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={s.weightBp / 100}
                        onChange={(e) =>
                          setAction(
                            'splits',
                            actions.splits?.map((r, n) =>
                              n === i
                                ? { ...r, weightBp: Math.round(Number(e.target.value) * 100) }
                                : r,
                            ),
                          )
                        }
                      />
                    )}
                  </Field>
                  <Button
                    variant="ghost"
                    disabled={actions.splits!.length <= 2}
                    onClick={() =>
                      setAction(
                        'splits',
                        actions.splits?.filter((_, n) => n !== i),
                      )
                    }
                  >
                    Split {i + 1} entfernen
                  </Button>
                </div>
              ))}
              {actions.splits && (
                <Button
                  variant="ghost"
                  disabled={actions.splits.length >= 20}
                  onClick={() =>
                    setAction('splits', [
                      ...actions.splits!,
                      { categoryId: categories[0]?.id ?? '', weightBp: 1000 },
                    ])
                  }
                >
                  Split hinzufügen
                </Button>
              )}
              <Field label="Als Umbuchung auf Konto markieren">
                {({ id }) => (
                  <Select
                    id={id}
                    disabled={!!actions.splits}
                    value={actions.transferAccountId ?? ''}
                    onChange={(e) => {
                      setAction('transferAccountId', e.target.value || undefined);
                      if (e.target.value) setAction('payeeId', null);
                    }}
                  >
                    <option value="">Keine Umbuchung</option>
                    <AccountOptions
                      accounts={accounts.data?.accounts ?? []}
                      keepId={actions.transferAccountId}
                    />
                  </Select>
                )}
              </Field>
              <p className="text-muted">
                Bei Umbuchungen zwischen Budgetkonten bleibt die Kategorie leer.
              </p>
              <label className="assignment-check">
                <input
                  type="checkbox"
                  checked={actions.memo !== undefined}
                  onChange={(e) => setAction('memo', e.target.checked ? '' : undefined)}
                />
                Notiz setzen
              </label>
              {actions.memo !== undefined && (
                <Field label="Neue Notiz">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      maxLength={4096}
                      value={actions.memo}
                      onChange={(e) => setAction('memo', e.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field label="Markierung setzen">
                {({ id }) => (
                  <Select
                    id={id}
                    value={actions.flag === undefined ? '' : (actions.flag ?? 'clear')}
                    onChange={(e) =>
                      setAction(
                        'flag',
                        e.target.value === ''
                          ? undefined
                          : e.target.value === 'clear'
                            ? null
                            : e.target.value,
                      )
                    }
                  >
                    <option value="">Keine Änderung</option>
                    <option value="clear">Markierung entfernen</option>
                    {[
                      ['red', 'Rot'],
                      ['orange', 'Orange'],
                      ['yellow', 'Gelb'],
                      ['green', 'Grün'],
                      ['blue', 'Blau'],
                      ['purple', 'Violett'],
                    ].map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </fieldset>
            <label className="assignment-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Regel aktiv
            </label>
            <label className="assignment-check">
              <input
                type="checkbox"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              Automatisch übernehmen
            </label>
            <p>
              Automatische Regeln bereiten die Zuordnung vor. Bankumsätze werden erst nach deiner
              Bestätigung gebucht. Die erste passende Regel hat Vorrang.
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {preview && (
            <div role="status">
              <p>Trifft auf {preview.count} Buchungen zu.</p>
              <ul>
                {preview.examples.map((r) => (
                  <li key={r.id}>
                    {r.date} · {formatDecimal(cents(r.amountCents))} € · {r.rawText}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="assignment-buttons assignment-editor-foot">
          <Button variant="ghost" disabled={busy} onClick={() => void test()}>
            Gegen Historie testen
          </Button>
          <Button disabled={busy} type="submit">
            Regel speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
