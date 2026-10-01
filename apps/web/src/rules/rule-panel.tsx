import { cents, formatDecimal, parseAmount } from '@budget/domain';
import {
  AmountInput,
  Button,
  DetailPanel,
  Field,
  Select,
  StatusMark,
  TextInput,
  type RuleStatus,
} from '@budget/ui';
import { useState, type FormEvent } from 'react';
import { longDay } from '../ledger/format';
import { patchRule, type RuleRow, type RuleStatusCode } from './api';
import {
  RULE_FIELDS,
  fieldError,
  fieldText,
  fieldValue,
  thresholdText,
  type FieldSpec,
} from './rules-model';
import { useRuleWrite } from './use-rule-writes';

const STATUS: Record<RuleStatusCode, RuleStatus> = { ok: 'met', warn: 'warning', bad: 'violated' };

/** Side panel (desktop) / bottom sheet (phone): current value, next step and the thresholds. */
export function RulePanel({ rule, onClose }: { rule: RuleRow | null; onClose: () => void }) {
  return (
    <DetailPanel
      open={rule !== null}
      onClose={onClose}
      title={rule ? `${rule.code} ${rule.name}` : ''}
    >
      {rule && (
        // Remounts when the stored parameters change (saved, undone, redone).
        <RuleForm key={`${rule.code}:${JSON.stringify(rule.params)}`} rule={rule} />
      )}
    </DetailPanel>
  );
}

/** Euro fields hold text; the stored value is integer cents. */
const initial = (spec: FieldSpec, value: unknown): string =>
  spec.unit === 'euro' ? formatDecimal(cents(Number(value ?? 0))) : fieldText(spec, value);

function RuleForm({ rule }: { rule: RuleRow }) {
  const write = useRuleWrite();
  const specs = RULE_FIELDS[rule.code] ?? [];
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(specs.map((s) => [s.key, initial(s, rule.params[s.key])])),
  );
  const [busy, setBusy] = useState(false);

  const errorOf = (s: FieldSpec): string | null => {
    const text = texts[s.key] ?? '';
    if (s.unit === 'euro') {
      const parsed = parseAmount(text);
      if (!parsed.ok) return 'Bitte einen Betrag eingeben.';
      return parsed.cents < (s.min ?? 0) || parsed.cents > (s.max ?? 0)
        ? 'Der Betrag liegt außerhalb des erlaubten Bereichs.'
        : null;
    }
    return fieldError(s, text);
  };
  const valueOf = (s: FieldSpec): unknown => {
    const text = texts[s.key] ?? '';
    if (s.unit === 'euro') {
      const parsed = parseAmount(text);
      return parsed.ok ? parsed.cents : undefined;
    }
    return fieldValue(s, text);
  };

  // Only what differs from the stored value goes to the server.
  const changed: Record<string, unknown> = {};
  let invalid = false;
  for (const s of specs) {
    if (errorOf(s)) {
      invalid = true;
      continue;
    }
    const value = valueOf(s);
    if (value !== rule.params[s.key]) changed[s.key] = value;
  }
  const dirty = Object.keys(changed).length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || invalid || !dirty) return;
    setBusy(true);
    await write(
      () => patchRule(rule.code, { params: changed }),
      () => `${rule.code} ${rule.name}: Schwelle gespeichert.`,
    );
    setBusy(false);
  };
  const reset = () =>
    setTexts(Object.fromEntries(specs.map((s) => [s.key, initial(s, rule.defaults[s.key])])));
  const atDefaults = specs.every((s) => (texts[s.key] ?? '') === initial(s, rule.defaults[s.key]));

  const { latest } = rule;
  return (
    <form className="kform rw-form" onSubmit={(e) => void submit(e)}>
      <section className="rw-now" aria-label="Aktueller Stand">
        {latest ? (
          <>
            <p className="rw-now-line">
              <StatusMark status={STATUS[latest.status]} actionNeeded={latest.actionNeeded} />
              <strong>{latest.valueText}</strong>
            </p>
            <p className="rw-now-sub">
              Stand {longDay(latest.asOf)}
              {!rule.enabled && ' · Regel ist ausgeschaltet'}
            </p>
          </>
        ) : (
          <p className="rw-now-sub">
            Noch nicht bewertbar: Es fehlen Daten für diese Regel.
            {!rule.enabled && ' Die Regel ist ausgeschaltet.'}
          </p>
        )}
        <p className="rw-action">
          <span className="rw-action-k">
            {latest?.actionNeeded ? 'Nächster Schritt' : 'Wenn die Regel anschlägt'}
          </span>
          {(latest?.actionNeeded ? latest.actionText : null) ??
            rule.action ??
            'Keine Aktion hinterlegt.'}
        </p>
        <p className="rw-now-sub">Schwelle: {thresholdText(rule.code, rule.params)}</p>
      </section>
      {specs.length === 0 && (
        <p className="rw-now-sub">Diese Regel hat keine Schwelle: Sie gilt immer.</p>
      )}
      {specs.map((s) => {
        const error = errorOf(s) ?? undefined;
        const text = texts[s.key] ?? '';
        const set = (value: string) => setTexts((t) => ({ ...t, [s.key]: value }));
        if (s.unit === 'euro')
          return (
            <AmountInput key={s.key} label={s.label} value={text} onChange={set} error={error} />
          );
        if (s.unit === 'choice')
          return (
            <Field key={s.key} label={s.label}>
              {({ id }) => (
                <Select id={id} value={text} onChange={(e) => set(e.target.value)}>
                  {s.choices?.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          );
        return (
          <Field key={s.key} label={s.label} error={error} hint={s.hint}>
            {({ id, describedBy, invalid: bad }) => (
              <span className="rw-input">
                <TextInput
                  id={id}
                  value={text}
                  inputMode={s.unit === 'pct' ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  aria-invalid={bad}
                  aria-describedby={describedBy}
                  onChange={(e) => set(e.target.value)}
                />
                {s.suffix && <span className="rw-suffix">{s.suffix}</span>}
              </span>
            )}
          </Field>
        );
      })}
      {specs.length > 0 && (
        <div className="panel-actions">
          <Button type="submit" disabled={busy || invalid || !dirty}>
            Speichern
          </Button>
          <Button variant="ghost" onClick={reset} disabled={atDefaults}>
            Standard
          </Button>
        </div>
      )}
    </form>
  );
}
