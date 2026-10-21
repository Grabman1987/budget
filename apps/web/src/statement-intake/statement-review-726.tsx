import {
  cents,
  formatDecimal,
  parseAmount,
  statementFactsSchema,
  type StatementFacts,
  type StatementIntakeView,
  type StatementReply,
} from '@budget/domain';
import { Button, Field, TextInput, WideDialog, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError, notifyApiWrite, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { errorText } from '../ledger/labels';
import { longDay, nativeCurrency } from '../ledger/format';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { StatementSettlementReview } from './statement-settlement-727';
import './statement-review-726.css';

const PATH = '/api/statement-intake';
const KEY = [...LEDGER_KEY, 'statement-intake'] as const;
type Draft = Record<Exclude<keyof StatementFacts, 'payableCents'>, string> & { amount: string };
const TEXT_FIELDS = [
  ['reference', 'Abrechnungsnummer'],
  ['issueDate', 'Ausstellungsdatum'],
  ['periodFrom', 'Zeitraum von'],
  ['periodTo', 'Zeitraum bis'],
  ['debitDate', 'Einzugsdatum'],
  ['accountHint', 'Kartenhinweis (maskiert)'],
] as const;
const STATUS = { pending: 'Zu prüfen', reviewed: 'Geprüft', rejected: 'Abgelehnt' };
const isDateField = (key: keyof Draft) =>
  key === 'issueDate' || key === 'debitDate' || key === 'periodFrom' || key === 'periodTo';
// Formatting only: the domain schema below validates the resulting ISO calendar day.
const dateIso = (raw: string) => raw.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
const factsFromView = (view: StatementIntakeView): StatementFacts => {
  if (!view.reviewed && view.proposal.draft) return view.proposal.draft;
  const fields = view.reviewed?.fields ?? view.proposal.fields;
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.value]),
  ) as StatementFacts;
};
const fromView = (view: StatementIntakeView): Draft => {
  const facts = factsFromView(view);
  return {
    reference: facts.reference ?? '',
    issueDate: facts.issueDate ? longDay(facts.issueDate) : '',
    periodFrom: facts.periodFrom ? longDay(facts.periodFrom) : '',
    periodTo: facts.periodTo ? longDay(facts.periodTo) : '',
    currency: facts.currency ?? '',
    debitDate: facts.debitDate ? longDay(facts.debitDate) : '',
    accountHint: facts.accountHint ?? '',
    amount: facts.payableCents === null ? '' : formatDecimal(cents(facts.payableCents)),
  };
};

/** The keyed boundary prevents a previous account's dialog/draft from migrating to another account. */
export function AccountStatementIntake({ accountId }: { accountId: string }) {
  return <AccountStatements key={accountId} accountId={accountId} />;
}

function AccountStatements({ accountId }: { accountId: string }) {
  useAmountPrivacy();
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const account = accounts.data?.accounts.find((row) => row.id === accountId);
  const list = useQuery({
    queryKey: [...KEY, accountId],
    queryFn: () =>
      request<{ intakes: StatementIntakeView[] }>(
        'GET',
        `${PATH}?accountId=${encodeURIComponent(accountId)}`,
      ),
  });
  const picker = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [documentBusy, setBusy] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementDirty, setSettlementDirty] = useState(false);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const busy = documentBusy || settlementBusy;
  const [current, setCurrent] = useState<StatementIntakeView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [saved, setSaved] = useState<Draft | null>(null);
  const [password, setPassword] = useState(''),
    [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [note, setNote] = useState('');
  const documentDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dirty = documentDirty || settlementDirty;
  const write = useBudgetWrite();
  const blocker = useBlocker({
    shouldBlockFn: () => open && (busy || dirty || password !== ''),
    withResolver: true,
    enableBeforeUnload: () => open && (busy || dirty || password !== ''),
  });
  useEffect(() => {
    if (blocker.status !== 'blocked') return;
    if (!busy && window.confirm('Ungespeicherte Angaben verwerfen?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, busy]);
  const mayDiscard = () =>
    !busy && (!(dirty || password) || window.confirm('Ungespeicherte Angaben verwerfen?'));
  const adopt = (view: StatementIntakeView) => {
    setCurrent(view);
    const next = fromView(view);
    setDraft(next);
    setSaved(next);
    setConflict(false);
    setError('');
  };
  const report = (cause: unknown) => {
    setConflict(cause instanceof ApiError && cause.status === 409);
    setError(
      cause instanceof ApiError && cause.status === 409
        ? 'Der Stand hat sich geändert oder dieses PDF gehört bereits zu einem anderen Konto. Ihre Angaben bleiben erhalten. Bitte den aktuellen Stand laden.'
        : errorText(cause),
    );
  };
  const readyAccount = Boolean(account && !accounts.isPending && !accounts.isError);
  const mismatch = list.data?.intakes.some((view) => view.accountId !== accountId);
  async function openView(view: StatementIntakeView) {
    if (!mayDiscard() || !readyAccount) return;
    setOpen(true);
    setBusy(true);
    setError('');
    setNote('');
    setCurrent(null);
    setDraft(null);
    setSaved(null);
    try {
      const result = await request<{ intake: StatementIntakeView }>(
        'GET',
        `${PATH}/${encodeURIComponent(view.id)}`,
      );
      if (result.intake.accountId !== accountId)
        throw new Error('Die Abrechnung gehört zu einem anderen Konto.');
      adopt(result.intake);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  async function upload(next: File) {
    if (busy || !readyAccount) return;
    setFile(next);
    setError('');
    setConflict(false);
    if (
      !next.size ||
      next.size > 15 * 1024 * 1024 ||
      (!/\.pdf$/i.test(next.name) && next.type !== 'application/pdf')
    ) {
      setError('Bitte eine PDF-Datei bis 15 MB auswählen.');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', next);
      body.set('accountId', accountId);
      if (password) body.set('password', password);
      const response = await fetch(`${PATH}/upload`, {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as StatementReply & {
        error?: string;
        message?: string;
      };
      if (
        response.status === 409 &&
        result.error === 'statement_deleted' &&
        result.intake?.accountId === accountId &&
        result.intake.deletedAt
      ) {
        adopt(result.intake);
        setFile(null);
        setNote(
          'Dieses PDF wurde bereits entfernt. Sie können dieselbe Abrechnung ausdrücklich wiederherstellen.',
        );
        return;
      }
      if (!response.ok)
        throw new ApiError(response.status, result.error ?? 'upload_failed', result.message);
      if (!result.intake || result.intake.accountId !== accountId)
        throw new Error('Die Upload-Antwort passt nicht zum Konto.');
      adopt(result.intake);
      setFile(null);
      setNote(
        result.duplicate
          ? 'Dieses PDF ist bereits vorhanden. Die bestehende Prüfung ist geöffnet.'
          : 'PDF gespeichert. Es wurde nichts gebucht.',
      );
      notifyApiWrite();
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  const amount = draft?.amount.trim() ? parseAmount(draft.amount) : null;
  const facts = draft
    ? statementFactsSchema.safeParse({
        reference: draft.reference.trim() || null,
        issueDate: dateIso(draft.issueDate) || null,
        periodFrom: dateIso(draft.periodFrom) || null,
        periodTo: dateIso(draft.periodTo) || null,
        payableCents: amount?.ok ? amount.cents : null,
        currency: draft.currency.trim() || null,
        debitDate: dateIso(draft.debitDate) || null,
        accountHint: draft.accountHint.trim() || null,
      })
    : null;
  const valid = Boolean(facts?.success && (!draft?.amount.trim() || amount?.ok));
  const complete =
    facts?.success &&
    (facts.data.reference || (facts.data.periodFrom && facts.data.periodTo)) &&
    facts.data.issueDate &&
    facts.data.payableCents !== null &&
    facts.data.currency &&
    facts.data.debitDate;
  async function act(
    action: 'review' | 'pending' | 'reparse' | 'reopen' | 'reject' | 'restore' | 'delete',
  ) {
    if (!current || busy || conflict || !readyAccount) return;
    if ((action === 'review' || action === 'pending') && !facts?.success) return;
    if (['reparse', 'reject', 'delete', 'reopen', 'restore'].includes(action) && !mayDiscard())
      return;
    if (
      action === 'delete' &&
      !window.confirm(
        'Abrechnung entfernen? Original und Verlauf bleiben für die Wiederherstellung erhalten.',
      )
    )
      return;
    setBusy(true);
    setError('');
    const tuple = {
      revision: current.revision,
      sha256: current.sha256,
      accountId: current.accountId,
    };
    const payload =
      action === 'review' || action === 'pending'
        ? {
            ...tuple,
            facts: facts?.success ? facts.data : null,
            ...(action === 'pending' ? { savePending: true } : {}),
          }
        : { ...tuple, ...(action === 'reparse' && password ? { password } : {}) };
    try {
      const result = await write(
        async () => {
          try {
            const reply = await request<StatementReply>(
              action === 'delete'
                ? 'DELETE'
                : action === 'review' || action === 'pending'
                  ? 'PUT'
                  : 'POST',
              `${PATH}/${encodeURIComponent(current.id)}${action === 'delete' ? '' : '/' + (action === 'pending' ? 'review' : action)}`,
              payload,
            );
            return {
              ...reply,
              groupId: reply.groupId ?? '',
              ...(!reply.groupId ? { changedCount: 0 } : {}),
            };
          } catch (cause) {
            report(cause);
            throw cause;
          }
        },
        () => 'Abrechnung aktualisiert. Es wurde nichts gebucht.',
      );
      if (result) {
        adopt(result.intake);
        setNote('Dokumentstand gespeichert. Keine Zahlung oder Buchung erstellt.');
      }
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  const update = (key: keyof Draft, value: string) =>
    setDraft((previous) => (previous ? { ...previous, [key]: value } : previous));
  const pending = current?.status === 'pending' && !current.deletedAt;
  const warnings = current?.proposal.warnings ?? [];
  const otherWarnings = warnings.some(
    (code) => code !== 'debit_date_required' && code !== 'possible_amendment',
  );
  const amountConflict =
    (current?.proposal.fields.payableCents.candidates.length ?? 0) > 1 ||
    warnings.includes('ambiguous_company_gross') ||
    warnings.includes('ambiguous_payableCents');
  const currencyConflict =
    (current?.proposal.fields.currency.candidates.length ?? 0) > 1 ||
    warnings.includes('ambiguous_currency');
  return (
    <div className="statement-intake-726">
      <Button
        variant="ghost"
        disabled={!readyAccount || busy}
        onClick={() => {
          if (!mayDiscard()) return;
          setSettlementOpen(false);
          setCurrent(null);
          setDraft(null);
          setSaved(null);
          setError('');
          setNote('');
          setFile(null);
          setPassword('');
          setOpen(true);
        }}
      >
        Abrechnung hochladen
      </Button>
      {list.isError && (
        <ErrorNote what="Abrechnungen" error={list.error} onRetry={() => void list.refetch()} />
      )}
      {mismatch && (
        <p role="alert">Abrechnungen konnten diesem Konto nicht sicher zugeordnet werden.</p>
      )}
      <WideDialog
        open={open}
        title={
          settlementOpen
            ? 'Abrechnungsausgleich'
            : current
              ? 'Abrechnung prüfen'
              : 'Abrechnung hochladen'
        }
        beforeClose={mayDiscard}
        onClose={() => {
          setOpen(false);
          setSettlementOpen(false);
          setPassword('');
        }}
      >
        <div className="statement-dialog-726" aria-busy={busy}>
          {settlementOpen && current ? (
            <StatementSettlementReview
              accountId={accountId}
              initialSource={current}
              onSourceAdopt={adopt}
              onDirty={setSettlementDirty}
              onBusy={setSettlementBusy}
              onBack={() => {
                if (!mayDiscard()) return;
                setSettlementOpen(false);
                setSettlementDirty(false);
              }}
              onManual={() => {
                if (!mayDiscard()) return false;
                setOpen(false);
                setSettlementOpen(false);
                return true;
              }}
            />
          ) : (
            <>
              <p>
                Konto: <strong>{account?.name ?? 'Nicht verfügbar'}</strong>
              </p>
              <p>
                Hier werden nur Dokumentangaben gespeichert. Es wird keine Zahlung oder Buchung
                erstellt.
              </p>
              {busy && <LoadingNote what="Abrechnungsdaten" />}
              {note && <p role="status">{note}</p>}
              {error && (
                <div role="alert">
                  <p>{error}</p>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (current) void openView(current);
                      else void list.refetch();
                    }}
                  >
                    {current ? 'Stand neu laden' : 'Liste neu laden'}
                  </Button>
                </div>
              )}
              {!current && (
                <>
                  <input
                    ref={picker}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Abrechnungs-PDF auswählen"
                    disabled={busy}
                    onChange={(event) => {
                      const selected = event.currentTarget.files?.[0];
                      if (event.currentTarget.files?.length === 1 && selected)
                        void upload(selected);
                      event.currentTarget.value = '';
                    }}
                  />
                  <p>Eine PDF-Datei · höchstens 15 MB</p>
                  <Button disabled={busy || !readyAccount} onClick={() => picker.current?.click()}>
                    PDF auswählen
                  </Button>
                  {file && error && (
                    <Button variant="ghost" disabled={busy} onClick={() => void upload(file)}>
                      PDF erneut hochladen
                    </Button>
                  )}
                </>
              )}
              {!current && !list.isError && !mismatch && Boolean(list.data?.intakes.length) && (
                <details className="statement-history-726">
                  <summary>Abrechnungen · {list.data?.intakes.length}</summary>
                  <ul>
                    {list.data?.intakes.map((view) => {
                      const shown = factsFromView(view);
                      return (
                        <li key={view.id}>
                          <Button
                            variant="ghost"
                            disabled={busy || !readyAccount}
                            onClick={() => void openView(view)}
                          >
                            {shown.reference ||
                              (shown.issueDate
                                ? longDay(shown.issueDate)
                                : 'Abrechnung ohne Nummer')}
                            {' · '}
                            {STATUS[view.status]}
                            {shown.payableCents !== null && shown.currency && (
                              <> · {nativeCurrency(shown.payableCents, shown.currency)}</>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  {list.data?.intakes.length === 50 && (
                    <p>Die 50 zuletzt aufgenommenen Abrechnungen werden angezeigt.</p>
                  )}
                </details>
              )}
              {current && draft && (
                <>
                  <p>
                    <strong>{current.deletedAt ? 'Entfernt' : STATUS[current.status]}</strong> ·
                    Dokumentprüfung, keine Zahlungsbestätigung
                  </p>
                  {!current.deletedAt && (
                    <a
                      className="btn btn-ghost"
                      href={`/api/receipts/${encodeURIComponent(current.receiptId)}/download`}
                    >
                      Original-PDF herunterladen
                    </a>
                  )}
                  {!current.deletedAt && current.status === 'reviewed' && (
                    <Button
                      disabled={busy || conflict}
                      onClick={() => {
                        if (!mayDiscard()) return;
                        if (documentDirty) setDraft(saved);
                        setSettlementOpen(true);
                      }}
                    >
                      Abrechnungsausgleich
                    </Button>
                  )}
                  {current.proposal.extraction !== 'parsed' && (
                    <p role="status">
                      {current.proposal.extraction === 'password_required'
                        ? 'Das PDF benötigt ein Passwort. Das Original bleibt gespeichert.'
                        : current.proposal.extraction === 'unreadable_or_limit'
                          ? 'Das PDF konnte nicht gelesen werden. Original herunterladen oder Angaben manuell prüfen.'
                          : 'Nicht alle Angaben wurden erkannt. Bitte anhand des Originals prüfen.'}
                    </p>
                  )}
                  {warnings.includes('debit_date_required') && (
                    <p role="status">
                      Im PDF wurde kein eindeutiges Einzugsdatum erkannt. Ausstellungsdatum und
                      Zahlungsbedingungen ersetzen es nicht.
                    </p>
                  )}
                  {otherWarnings && (
                    <p role="status">
                      Das PDF enthält unklare, widersprüchliche oder nicht unterstützte Angaben.
                      Bitte die betroffenen Felder anhand des Originals prüfen.
                    </p>
                  )}
                  {current.proposal.relatedIntakeIds.length > 0 && (
                    <p role="status">
                      Mögliche weitere Fassung einer vorhandenen Abrechnung. Es wurde nichts ersetzt
                      oder zusammengeführt.
                    </p>
                  )}
                  <div className="statement-fields-726">
                    {TEXT_FIELDS.map(([key, label]) => (
                      <Field
                        key={key}
                        label={label}
                        hint={
                          (isDateField(key) ? dateIso(draft[key]) : draft[key]) !==
                            String(
                              (current.reviewed?.fields[key] ?? current.proposal.fields[key])
                                .value ?? '',
                            ) || current.reviewed?.fields[key].origin === 'owner'
                            ? 'Eigene Angabe'
                            : current.proposal.fields[key].candidates.length > 1
                              ? 'Mehrere Angaben im PDF; bitte einen eindeutigen Wert manuell eintragen'
                              : current.proposal.fields[key].origin === 'printed'
                                ? `PDF${current.proposal.fields[key].evidence.line ? ' · Zeile ' + current.proposal.fields[key].evidence.line : ''}`
                                : 'Nicht erkannt; bleibt ohne manuelle Angabe unbekannt'
                        }
                      >
                        {({ id, describedBy, invalid }) => (
                          <TextInput
                            id={id}
                            aria-describedby={describedBy}
                            aria-invalid={invalid}
                            type="text"
                            inputMode="text"
                            placeholder={isDateField(key) ? 'TT.MM.JJJJ' : undefined}
                            value={draft[key]}
                            maxLength={128}
                            disabled={!pending || busy}
                            onChange={(event) => update(key, event.target.value)}
                          />
                        )}
                      </Field>
                    ))}
                    <Field
                      label="Abrechnungsbetrag"
                      hint={`${amountConflict ? 'Betragsangaben im PDF sind nicht eindeutig. Eigene Angabe anhand des Originals prüfen. ' : ''}Exakt laut Abrechnung; leer bedeutet unbekannt, 0,00 bedeutet ausdrücklich null.`}
                    >
                      {({ id, describedBy, invalid }) => (
                        <TextInput
                          id={id}
                          aria-describedby={describedBy}
                          aria-invalid={invalid}
                          money
                          inputMode="decimal"
                          value={draft.amount}
                          disabled={!pending || busy}
                          onChange={(event) => update('amount', event.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      label="Währung"
                      hint={`${currencyConflict ? 'Währungsangaben im PDF sind nicht eindeutig. Eigene Angabe anhand des Originals prüfen. ' : ''}Keine Umrechnung und keine Ableitung aus dem Kontosaldo.`}
                    >
                      {({ id, describedBy, invalid }) => (
                        <TextInput
                          id={id}
                          aria-describedby={describedBy}
                          aria-invalid={invalid}
                          value={draft.currency}
                          maxLength={3}
                          disabled={!pending || busy}
                          onChange={(event) => update('currency', event.target.value.toUpperCase())}
                        />
                      )}
                    </Field>
                  </div>
                  {pending && !valid && (
                    <p role="alert">
                      Bitte gültige Kalenderdaten, Betrag, Währung und einen maskierten
                      Kartenhinweis (****1234) eingeben oder unbekannte Felder leer lassen.
                    </p>
                  )}
                  {pending && !complete && (
                    <p>
                      Als geprüft speicherbar mit Nummer oder vollständigem Zeitraum,
                      Ausstellungsdatum, Betrag, Währung und ausdrücklich angegebenem Einzugsdatum.
                    </p>
                  )}
                  <div className="statement-actions-726">
                    {pending ? (
                      <>
                        <Button
                          disabled={busy || conflict || !complete || !valid}
                          onClick={() => void act('review')}
                        >
                          Als geprüft speichern
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || conflict || !valid}
                          onClick={() => void act('pending')}
                        >
                          Entwurf speichern
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || conflict}
                          onClick={() => void act('reparse')}
                        >
                          Erneut auswerten
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || conflict}
                          onClick={() => void act('reject')}
                        >
                          Ablehnen
                        </Button>
                      </>
                    ) : current.deletedAt ? (
                      <Button disabled={busy || conflict} onClick={() => void act('restore')}>
                        Wiederherstellen
                      </Button>
                    ) : (
                      <Button disabled={busy || conflict} onClick={() => void act('reopen')}>
                        Prüfung wieder öffnen
                      </Button>
                    )}
                    {!current.deletedAt && (
                      <Button
                        variant="ghost"
                        disabled={busy || conflict}
                        onClick={() => void act('delete')}
                      >
                        Dokument entfernen
                      </Button>
                    )}
                    <Button variant="ghost" disabled={busy} onClick={() => void openView(current)}>
                      Stand neu laden
                    </Button>
                  </div>
                </>
              )}
              {(!current || pending) && (
                <Field
                  label="PDF-Passwort (optional)"
                  hint="Nur für diese Auswertung; wird nicht gespeichert."
                >
                  {({ id, describedBy, invalid }) => (
                    <TextInput
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      type="password"
                      autoComplete="off"
                      maxLength={256}
                      value={password}
                      disabled={busy}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  )}
                </Field>
              )}
            </>
          )}
        </div>
      </WideDialog>
    </div>
  );
}
