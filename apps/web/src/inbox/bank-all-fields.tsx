import { AmountInput, Button, Field, Select, useAmountPrivacy } from '@budget/ui';
import { Plus, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { newSplit } from '../ledger/booking-model';
import { eur, longDay } from '../ledger/format';
import { ProjectField } from '../ledger/project-field';
import type { Lookups } from '../ledger/types';
import {
  AttachedReceipts,
  ReceiptSection,
  type AttachedReceipt,
} from '../receipts/receipt-section';
import {
  MAX_BANK_SPLIT_LINES,
  TOO_MANY_LINES,
  bankSplitRest,
  fillRest,
  startSplit,
  type BankAllFields,
  type BankLine,
} from './bank-all-fields-model';

/**
 * Collapsed "Alle Felder" section of the bank confirmation (#1048): the remaining booking details
 * of the full booking form. Bank amount and date are facts and stay read-only.
 */
export function BankAllFieldsSection({
  line,
  value,
  onChange,
  categoryOptions,
  categoryId,
  projects,
  ruleActive,
  onSplitManually,
  splitError,
  attached,
  onAttach,
  onRemoveReceipt,
  onUploadBusy,
  busy,
}: {
  line: BankLine;
  value: BankAllFields;
  onChange: (next: BankAllFields) => void;
  /** `<option>`/`<optgroup>` list shared with the single Kategorie field. */
  categoryOptions: ReactNode;
  /** The single category chosen so far; it becomes the first split line. */
  categoryId: string;
  projects: Lookups['projects'];
  /** A rule suggestion is applied; manual split lines replace it only on explicit request. */
  ruleActive: boolean;
  onSplitManually: () => void;
  splitError: string | undefined;
  attached: AttachedReceipt[];
  onAttach: (file: AttachedReceipt) => void;
  onRemoveReceipt: (id: string) => void;
  onUploadBusy: (busy: boolean) => void;
  busy: boolean;
}) {
  useAmountPrivacy();
  const restId = useId(),
    limitId = useId();
  const set = (patch: Partial<BankAllFields>) => onChange({ ...value, ...patch });
  const setLine = (key: string, patch: Partial<BankAllFields['splits'][number]>) =>
    set({ splits: value.splits.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const rest = value.splitOn ? bankSplitRest(line, value.splits) : 0;
  return (
    <details className="bank-all-fields" data-testid="bank-all-fields">
      <summary>Alle Felder</summary>
      <div className="bank-all-fields-body kform">
        <dl className="bank-all-fields-facts">
          <div>
            <dt>Betrag laut Bank</dt>
            <dd>{eur(line.amountCents, { sign: true })}</dd>
          </div>
          <div>
            <dt>Datum laut Bank</dt>
            <dd>{longDay(line.date)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Bestätigt, sobald du die Buchung bestätigst</dd>
          </div>
        </dl>
        <Field label="Notiz">
          {({ id }) => (
            <textarea
              id={id}
              className="input bk-note"
              rows={2}
              value={value.memo}
              disabled={busy}
              placeholder="Leer lässt den Verwendungszweck der Bank stehen"
              autoComplete="off"
              onChange={(e) => set({ memo: e.target.value })}
            />
          )}
        </Field>
        <ProjectField
          projects={projects}
          value={value.projectId}
          disabled={busy}
          onChange={(projectId) => set({ projectId })}
        />
        {!value.splitOn ? (
          <div className="bank-all-fields-split-start">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (ruleActive) onSplitManually();
                onChange({ ...value, splitOn: true, splits: startSplit(line, categoryId) });
              }}
            >
              {ruleActive ? 'Selbst aufteilen' : 'Aufteilen'}
            </Button>
            {ruleActive && (
              <p className="kmeta">
                Eine eigene Aufteilung ersetzt den Regelvorschlag samt seiner Aufteilung.
              </p>
            )}
          </div>
        ) : (
          <fieldset className="bank-split" disabled={busy} aria-describedby={restId}>
            <legend>Aufteilung</legend>
            {value.splits.map((split, index) => {
              const n = index + 1;
              return (
                <div className="bank-split-line" key={split.key} data-testid="bank-split-line">
                  <Field label={`Kategorie ${n}`}>
                    {({ id }) => (
                      <Select
                        id={id}
                        value={split.categoryId}
                        onChange={(e) => setLine(split.key, { categoryId: e.target.value })}
                      >
                        {categoryOptions}
                      </Select>
                    )}
                  </Field>
                  <AmountInput
                    label={`Betrag ${n}`}
                    showOperators={false}
                    value={split.amount}
                    onChange={(amount) => setLine(split.key, { amount })}
                  />
                  <div className="bank-split-line-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Rest in Zeile ${n} übernehmen`}
                      onClick={() => set({ splits: fillRest(line, value.splits, split.key) })}
                    >
                      Rest
                    </Button>
                    {value.splits.length > 2 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Zeile ${n} entfernen`}
                        onClick={() =>
                          set({ splits: value.splits.filter((s) => s.key !== split.key) })
                        }
                      >
                        <X size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <p id={restId} className="bank-split-rest" role="status">
              Rest: {eur(rest)}
              {splitError ? ` · ${splitError}` : ''}
            </p>
            {value.splits.length >= MAX_BANK_SPLIT_LINES && (
              <p id={limitId} className="kmeta">
                {TOO_MANY_LINES}
              </p>
            )}
            <div className="bank-split-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={value.splits.length >= MAX_BANK_SPLIT_LINES}
                aria-describedby={value.splits.length >= MAX_BANK_SPLIT_LINES ? limitId : undefined}
                onClick={() => set({ splits: [...value.splits, newSplit()] })}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                Zeile hinzufügen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => set({ splitOn: false, splits: [] })}>
                Nicht aufteilen
              </Button>
            </div>
          </fieldset>
        )}
        <div className="bank-all-fields-receipts">
          <span className="bank-all-fields-label">Beleg</span>
          <ReceiptSection uploadOnly onAttached={onAttach} onBusyChange={onUploadBusy} />
          <AttachedReceipts items={attached} onRemove={onRemoveReceipt} />
        </div>
      </div>
    </details>
  );
}
