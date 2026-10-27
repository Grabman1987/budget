import {
  useAmountPrivacy,
  AmountInput,
  Button,
  Segmented,
  ClassSwatch,
  maskMoneyText,
} from '@budget/ui';
import { parseAmount } from '@budget/domain';
import { ChevronDown } from 'lucide-react';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  newSplit,
  splitRemainder,
  distributeRest,
  expandBookingLines,
  type BookingDraft,
  type BookingLineDraft,
  type SplitDraft,
} from './booking-model';
import { CategoryCombobox } from './category-picker';
import type { PickCategory } from './capture-model';
import { ContactSelect } from './contact-select';
import { eur } from './format';
import type { AccountRow } from './types';

export interface SplitEditorProps {
  draft: BookingDraft;
  setDraft: Dispatch<SetStateAction<BookingDraft>>;
  categories: ReadonlyArray<PickCategory>;
  accounts: ReadonlyArray<
    Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'>
  >;
  accountId: string;
  contacts: ReadonlyArray<{ id: string; name: string }>;
  hasAdvanceCategory: boolean;
  locked: boolean;
  error: string | undefined;
  suggestions?: ReadonlyArray<PickCategory>;
  singleMetadata?: Partial<SplitDraft>;
}

/** Retain stored rows independently: the ledger does not store a gross-line grouping. */
export function captureLines(
  draft: BookingDraft,
  singleMetadata: Partial<SplitDraft> = {},
): BookingLineDraft[] {
  if (draft.lines)
    return draft.lines.map((line) =>
      !draft.splitOn && draft.lines?.length === 1
        ? {
            ...line,
            amount: draft.amount,
            ...(draft.kind === 'income' ? { incomeTypeId: draft.incomeTypeId || null } : {}),
          }
        : line,
    );
  if (draft.splitOn) return draft.splits.map((line) => ({ ...line, shares: [] }));
  return [
    {
      key: 'single',
      type: draft.contactId ? 'contact' : 'category',
      categoryId: draft.categoryId,
      toAccountId: '',
      amount: draft.amount,
      memo: '',
      contactId: draft.contactId || null,
      incomeTypeId: draft.kind === 'income' ? draft.incomeTypeId || null : null,
      ...singleMetadata,
      shares: [],
    },
  ];
}

/** Gross amount · category/outlay · contact shares, using the existing cent-exact mapper. */
export function SplitEditor({
  draft,
  setDraft,
  categories,
  accounts,
  accountId,
  contacts,
  locked,
  error,
  suggestions = [],
  singleMetadata,
}: SplitEditorProps) {
  useAmountPrivacy();
  const editorRef = useRef<HTMLFieldSetElement>(null);
  const [creatingLine, setCreatingLine] = useState<string>();
  const lines = captureLines(draft, singleMetadata);
  const multiple = draft.splitOn && lines.length > 1;
  const rest = splitRemainder(draft.amount, lines);
  const expanded = expandBookingLines({ ...draft, lines });
  const sharingInvalid = lines.some((line) => line.shares.length) && !expanded.splits.length;
  const update = (
    next: BookingLineDraft[] | ((current: BookingLineDraft[]) => BookingLineDraft[]),
  ) =>
    setDraft((d) => {
      const updated = typeof next === 'function' ? next(captureLines(d, singleMetadata)) : next;
      return {
        ...d,
        lines: updated,
        splitOn: updated.length > 1,
        categoryId: updated[0]?.type === 'category' ? updated[0].categoryId : '',
        contactId:
          updated.length === 1 && updated[0]?.type === 'contact'
            ? (updated[0].contactId ?? '')
            : '',
      };
    });
  const change = (key: string, patch: Partial<BookingLineDraft>) =>
    update((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const choose = (line: BookingLineDraft, id: string) => {
    if (id === '__new-contact') return setCreatingLine(line.key);
    if (id.startsWith('__contact:'))
      change(line.key, {
        type: 'contact',
        contactId: id.slice(10),
        categoryId: '',
        toAccountId: '',
        shares: [],
      });
    else if (id.startsWith('__transfer:'))
      change(line.key, {
        type: 'transfer',
        toAccountId: id.slice(11),
        contactId: null,
        categoryId: '',
        shares: [],
      });
    else
      change(line.key, {
        type: 'category',
        categoryId: id === '__none' ? '' : id,
        contactId: null,
        toAccountId: '',
      });
  };
  return (
    <fieldset ref={editorRef} className="bk-lines" disabled={locked}>
      <legend className="sr-only">Betrag · Kategorie · Teilen</legend>
      {locked && (
        <p className="khint">
          Diese Aufteilung enthält eine Umbuchung. Zum Ändern die Buchung löschen und neu erfassen.
        </p>
      )}
      {lines.map((line, index) => {
        const n = index + 1;
        const category = categories.find((c) => c.id === line.categoryId);
        const contact = contacts.find((c) => c.id === line.contactId);
        const retained = parseAmount(
          expanded.splits.find((s) => s.key === line.key)?.amount ?? '0',
        );
        const shareChange = (key: string, patch: Partial<BookingLineDraft['shares'][number]>) =>
          update((current) =>
            current.map((row) =>
              row.key === line.key
                ? {
                    ...row,
                    shares: row.shares.map((share) =>
                      share.key === key ? { ...share, ...patch } : share,
                    ),
                  }
                : row,
            ),
          );
        const contactsLast = [
          ...contacts.map((c) => ({
            id: `__contact:${c.id}`,
            label: `${draft.kind === 'income' ? 'Rückzahlung von Kontakt' : 'Für Kontakt auslegen'} → ${c.name}`,
            group: 'Kontakte',
          })),
          { id: '__new-contact', label: 'Kontakt neu anlegen', group: 'Kontakte' },
        ];
        const leading = [
          ...(draft.kind === 'income' ? [{ id: '__none', label: 'Zu verteilen' }] : []),
          ...(draft.kind === 'expense' && multiple
            ? accounts
                .filter((a) => a.id !== accountId)
                .map((a) => ({
                  id: `__transfer:${a.id}`,
                  label: `Umbuchung → ${a.name}`,
                  group: 'Konten',
                }))
            : []),
        ];
        const selectedName =
          line.type === 'contact'
            ? `${draft.kind === 'income' ? 'Rückzahlung von Kontakt' : 'Für Kontakt auslegen'} → ${contact?.name ?? 'Kontakt wählen'}`
            : line.type === 'transfer'
              ? `Umbuchung → ${accounts.find((a) => a.id === line.toAccountId)?.name ?? ''}`
              : (category?.name ??
                (draft.kind === 'income' && !line.categoryId ? 'Zu verteilen' : ''));
        return (
          <div
            className="bk-line"
            key={line.key}
            data-line-key={line.key}
            role="group"
            aria-label={`Zeile ${n}`}
          >
            <div className={`bk-line-fields${multiple ? ' is-multiple' : ''}`}>
              {multiple && (
                <AmountInput
                  label={`Betrag ${n}`}
                  value={line.amount}
                  showOperators={false}
                  onChange={(amount) => change(line.key, { amount })}
                />
              )}
              <CategoryCombobox
                label={multiple ? `Kategorie ${n}` : 'Kategorie'}
                categories={categories}
                leading={leading}
                trailing={contactsLast}
                capturePicker
                selectedName={selectedName}
                error={!multiple ? error : undefined}
                onSelect={(id) => choose(line, id)}
              />
              {line.type === 'category' && (
                <Button
                  variant="ghost"
                  className="bk-share-toggle"
                  aria-expanded={line.shares.length > 0}
                  onClick={() =>
                    change(line.key, {
                      shares: line.shares.length
                        ? line.shares
                        : [{ ...newSplit({ type: 'contact', amount: '50' }), mode: 'percent' }],
                    })
                  }
                >
                  Teilen{' '}
                  <ChevronDown
                    className="disclosure-chevron"
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Button>
              )}
            </div>
            {creatingLine === line.key && (
              <ContactSelect
                label="Neuer Kontakt"
                value=""
                onChange={(contactId) => {
                  if (contactId) {
                    choose(line, `__contact:${contactId}`);
                    setCreatingLine(undefined);
                    requestAnimationFrame(() => {
                      const row = Array.from(
                        editorRef.current?.querySelectorAll<HTMLElement>('.bk-line') ?? [],
                      ).find((el) => el.dataset['lineKey'] === line.key);
                      row?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
                    });
                  }
                }}
                contacts={contacts}
                noneLabel="Kontakt wählen"
                createInitially
                onUndoCreated={(id) =>
                  update((current) =>
                    current.map((row) =>
                      row.key === line.key && row.contactId === id
                        ? { ...row, type: 'category', contactId: null, categoryId: '' }
                        : row,
                    ),
                  )
                }
              />
            )}
            {line.type === 'transfer' &&
              accounts.some((a) => a.id === line.toAccountId && !a.onBudget) && (
                <CategoryCombobox
                  label={`Kategorie für Umbuchung ${n}`}
                  capturePicker
                  categories={categories}
                  selectedName={category?.name ?? ''}
                  onSelect={(categoryId) => change(line.key, { categoryId })}
                />
              )}
            {index === 0 && line.type === 'category' && suggestions.length > 0 && (
              <div className="bk-suggestions" role="group" aria-label="Vorschläge">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    aria-pressed={c.id === line.categoryId}
                    onClick={() => choose(line, c.id)}
                  >
                    {c.cls && <ClassSwatch kind={c.cls} />}
                    <span className="bk-chip-name">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            {line.type === 'category' &&
              category?.availableCents !== null &&
              category?.availableCents !== undefined && (
                <p className="kavail" aria-live="polite">
                  Verfügbar: <strong>{eur(category.availableCents)}</strong>
                  {draft.kind === 'expense' && retained.ok && (
                    <> · danach {eur(category.availableCents - retained.cents)}</>
                  )}
                </p>
              )}
            {line.shares.map((share, shareIndex) => {
              const label = `${n}.${shareIndex + 1}`;
              return (
                <div
                  className="bk-share"
                  key={share.key}
                  role="group"
                  aria-label={`Kontaktanteil ${label}`}
                >
                  <p className="bk-share-heading">
                    {contacts.find((c) => c.id === share.contactId)?.name ?? 'Kontakt'} trägt
                  </p>
                  <ContactSelect
                    label={`Kontakt ${label}`}
                    value={share.contactId ?? ''}
                    contacts={contacts}
                    noneLabel="Kontakt wählen"
                    onChange={(contactId) =>
                      shareChange(share.key, { contactId: contactId || null })
                    }
                  />
                  <div className="bk-share-value">
                    <Segmented
                      label={`Anteilart ${label}`}
                      options={[
                        { value: 'percent', label: '%' },
                        { value: 'amount', label: 'Betrag' },
                      ]}
                      value={share.mode}
                      onChange={(mode) => {
                        const split = expanded.splits.find((s) => s.key === share.key);
                        // Switching units keeps the current euro share; switching back starts at 50%.
                        shareChange(share.key, {
                          mode,
                          amount: mode === 'amount' ? (split?.amount ?? '') : '50',
                        });
                      }}
                    />
                    <AmountInput
                      currency={share.mode === 'percent' ? '%' : 'EUR'}
                      label={`Anteil ${label}${share.mode === 'percent' ? ' (%)' : ' (€)'}`}
                      value={share.amount}
                      showOperators={false}
                      onChange={(amount) => shareChange(share.key, { amount })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`Kontaktanteil ${label} entfernen`}
                    onClick={() =>
                      change(line.key, { shares: line.shares.filter((s) => s.key !== share.key) })
                    }
                  >
                    Entfernen
                  </Button>
                </div>
              );
            })}
            {line.shares.length > 0 && (
              <>
                <p className="khint" aria-live="polite">
                  {sharingInvalid
                    ? 'Kontakt und gültigen Anteil wählen. Anteile dürfen den Zeilenbetrag nicht überschreiten.'
                    : `Kategorie behält ${eur(retained.ok ? retained.cents : 0)}`}
                </p>
                <Button
                  variant="ghost"
                  onClick={() =>
                    change(line.key, {
                      shares: [
                        ...line.shares,
                        { ...newSplit({ type: 'contact', amount: '50' }), mode: 'percent' },
                      ],
                    })
                  }
                >
                  + Weiterer Kontakt
                </Button>
              </>
            )}
            {multiple && (
              <div className="bk-line-actions">
                {rest !== 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const filled = distributeRest(
                        { ...draft, splits: lines },
                        line.key,
                      ).splits.find((row) => row.key === line.key);
                      if (filled) change(line.key, { amount: filled.amount });
                    }}
                    aria-label={`Rest verteilen in Zeile ${n}`}
                  >
                    Rest verteilen
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-label={`Zeile ${n} entfernen`}
                  onClick={() => update(lines.filter((s) => s.key !== line.key))}
                >
                  Entfernen
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <Button variant="ghost" onClick={() => update([...lines, { ...newSplit(), shares: [] }])}>
        + Weitere Kategorie
      </Button>
      {(multiple || lines.some((line) => line.shares.length > 0)) && (
        <p
          className={rest === 0 && !sharingInvalid ? 'kdiff is-ok' : 'kdiff is-bad'}
          aria-live="polite"
        >
          Rest: {eur(rest)}
          {(rest !== 0 || lines.some((line) => !line.amount) || sharingInvalid) && (
            <span>
              {' '}
              · Speichern geht erst, wenn alle Zeilen gültig sind und der Rest 0,00 € ist.
            </span>
          )}
        </p>
      )}
      {error && multiple && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
    </fieldset>
  );
}
