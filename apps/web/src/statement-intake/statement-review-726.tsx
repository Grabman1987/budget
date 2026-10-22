import {
  cents,
  formatDecimal,
  parseAmount,
  statementFactsSchema,
  type StatementFacts,
  type StatementIntakeView,
  type StatementReply,
  type StatementAutomationConfig,
  type StatementAutomationOutcome,
  type StatementSettlementState,
} from '@budget/domain';
import { Button, Field, Select, TextInput, WideDialog, useAmountPrivacy } from '@budget/ui';
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
import { expectedQuery } from '../expected/api';
import { StatementBookingLinks } from './statement-booking-links';
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
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationDirty, setAutomationDirty] = useState(false);
  const [automationEditorKey, setAutomationEditorKey] = useState(0);
  const [automation, setAutomation] = useState<StatementAutomationOutcome | null>(null);
  const [linksBusy, setLinksBusy] = useState(false),
    [linksDirty, setLinksDirty] = useState(false);
  const [linksEditorKey, setLinksEditorKey] = useState(0);
  const busy = documentBusy || settlementBusy || automationBusy || linksBusy;
  const [current, setCurrent] = useState<StatementIntakeView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [saved, setSaved] = useState<Draft | null>(null);
  const [password, setPassword] = useState(''),
    [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [note, setNote] = useState('');
  const documentDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const dirty = documentDirty || settlementDirty || automationDirty || linksDirty;
  const historyBlocked = useRef(false);
  historyBlocked.current =
    documentBusy || automationBusy || linksBusy || documentDirty || automationDirty ||
    linksDirty || password !== '' || conflict;
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
  const mayDiscard = () => {
    if (busy || ((dirty || password) && !window.confirm('Ungespeicherte Angaben verwerfen?')))
      return false;
    if (automationDirty) {
      setAutomationDirty(false);
      setAutomationEditorKey((key) => key + 1);
    }
    if (linksDirty) {
      setLinksDirty(false);
      setLinksEditorKey((key) => key + 1);
    }
    return true;
  };
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
    setAutomation(null);
    setCurrent(null);
    setDraft(null);
    setSaved(null);
    try {
      const [result, resultAutomation] = await Promise.all([
        request<{ intake: StatementIntakeView }>('GET', `${PATH}/${encodeURIComponent(view.id)}`),
        request<{ automation: StatementAutomationOutcome | null }>(
          'GET',
          `${PATH}/${encodeURIComponent(view.id)}/automation`,
        ),
      ]);
      if (result.intake.accountId !== accountId)
        throw new Error('Die Abrechnung gehört zu einem anderen Konto.');
      adopt(result.intake);
      setAutomation(resultAutomation.automation);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  async function upload(next: File) {
    if (busy || !readyAccount) return;
    if (automationDirty || linksDirty) {
      setError('Bitte Einrichtung oder Verknüpfungsauswahl zuerst speichern oder verwerfen.');
      return;
    }
    setAutomation(null);
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
      body.set('automation', 'eligible');
      if (password) body.set('password', password);
      const response = await fetch(`${PATH}/upload`, {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as StatementReply & {
        automation?: StatementAutomationOutcome;
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
      setAutomation(result.automation ?? null);
      setNote(
        result.duplicate
          ? 'Dieses PDF ist bereits vorhanden. Es wird keine automatische Aktion wiederholt.'
          : result.automation?.groupId
            ? 'PDF und eindeutig validierte Angaben gespeichert. Offene Teile bleiben unter Prüfen.'
            : 'PDF gespeichert. Unklare oder noch nicht eingerichtete Teile bleiben unter Prüfen.',
      );
      if (result.automation?.groupId) {
        const groupId = result.automation.groupId;
        await write(
          async () => ({ groupId }),
          () => 'Eindeutige Abrechnungsdaten automatisch gespeichert.',
        );
      }
      notifyApiWrite();
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  async function automateCurrent() {
    if (
      !current ||
      busy ||
      conflict ||
      !readyAccount ||
      current.status !== 'pending' ||
      !mayDiscard()
    )
      return;
    setBusy(true);
    setError('');
    try {
      const reply = await request<StatementReply & { automation: StatementAutomationOutcome }>(
        'POST',
        `${PATH}/${encodeURIComponent(current.id)}/automate`,
        {
          revision: current.revision,
          sha256: current.sha256,
          accountId: current.accountId,
          ...(password ? { password } : {}),
        },
      );
      if (reply.intake.accountId !== accountId)
        throw new Error('Abrechnung gehört zu einem anderen Konto.');
      adopt(reply.intake);
      setAutomation(reply.automation);
      setNote('Gespeichertes Original ausgewertet. Offene Teile bleiben unter Prüfen.');
      if (reply.automation.groupId) {
        const groupId = reply.automation.groupId;
        await write(
          async () => ({ groupId }),
          () => 'Eindeutige Abrechnungsdaten automatisch gespeichert.',
        );
      }
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
          setAutomation(null);
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
              canSourceHistoryChange={() => !historyBlocked.current}
              onSourceHistoryConflict={() => {
                setConflict(true);
                setError('Der Dokumentstand hat sich geändert. Bitte den aktuellen Stand neu laden.');
              }}
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
                Eingerichtete neue Uploads speichern ausschließlich eindeutig validierte Angaben und
                verknüpfen passende bestehende Buchungen. Vollständig belegte neue Buchungen werden
                erfasst; Unklares bleibt unter Prüfen. Es wird kein Bankauftrag gesendet.
              </p>
              {readyAccount && (
                <StatementAutomationSettings
                  key={`${accountId}-${automationEditorKey}`}
                  accountId={accountId}
                  accounts={accounts.data?.accounts ?? []}
                  disabled={documentBusy || settlementBusy || linksBusy}
                  suggested={automation?.suggestedCardHints ?? []}
                  onBusy={setAutomationBusy}
                  onDirty={setAutomationDirty}
                />
              )}
              {automation && <StatementAutomationResult outcome={automation} />}
              {current && !current.deletedAt && (
                <StatementBookingLinks
                  key={`${current.id}-${linksEditorKey}`}
                  intakeId={current.id}
                  accountId={accountId}
                  disabled={documentBusy || settlementBusy || automationBusy || conflict}
                  onBusy={setLinksBusy}
                  onDirty={setLinksDirty}
                />
              )}
              {current?.status === 'pending' && !current.deletedAt && (
                <Button
                  variant="ghost"
                  disabled={busy || conflict || automationDirty}
                  onClick={() => void automateCurrent()}
                >
                  Gespeichertes PDF automatisch prüfen
                </Button>
              )}
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

const automaticReason = (reason: string): string => {
  const messages: Record<string, string> = {
    automation_not_configured: 'Automatische Verarbeitung ist noch nicht eingerichtet.',
    previous_source_required: 'Die vorherige Abrechnung wird für Jahr und Saldo benötigt.',
    previous_source_needs_review: 'Die vorherige Abrechnung ist nicht eindeutig validiert.',
    retained_source_unavailable: 'Das gespeicherte Original konnte nicht verifiziert werden.',
    source_extraction_unavailable: 'Das PDF konnte nicht eindeutig ausgelesen werden.',
    duplicate_source: 'Dieses Original ist bereits vorhanden.',
    mapping_required: 'Bitte Kartenhinweis und Konto ausdrücklich zuordnen.',
    debit_date_required: 'Ein eindeutig belegtes Einzugsdatum fehlt.',
  };
  return messages[reason] ?? 'Dieser Teil ist nicht eindeutig belegt und bleibt zur Prüfung offen.';
};
function StatementAutomationResult({ outcome }: { outcome: StatementAutomationOutcome }) {
  const reasons = [...new Set([...outcome.reasons, ...outcome.pending.map((row) => row.reason)])];
  const roles = {
    created: 'Neue Buchung',
    matched: 'Zugeordnete Buchung',
    credit: 'Gutschrift',
    original: 'Ursprünglicher Aufwand',
    settlement: 'Abrechnungsausgleich',
  };
  const items = outcome.status === 'undone' ? [] : (outcome.items ?? []);
  return (
    <section aria-label="Automatisches Verarbeitungsergebnis">
      <p role="status">
        {outcome.status === 'undone'
          ? 'Die frühere automatische Aktion wurde rückgängig gemacht. Sie wird nicht erneut ausgeführt.'
          : outcome.status === 'unchanged'
            ? 'Bereits vorhandener Stand; keine automatische Aktion wiederholt.'
            : outcome.status === 'review'
              ? 'Teilweise oder noch nicht verarbeitet: Bitte prüfen.'
              : 'Eindeutig validierte Teile automatisch gespeichert.'}
      </p>
      <p>
        {outcome.status === 'unchanged' || outcome.status === 'undone'
          ? 'Historisches Verarbeitungsergebnis – damals angelegte Buchungen: '
          : 'Neue Buchungen: '}
        {outcome.created} · bestehende zugeordnet: {outcome.matched} · Gutschriften:{' '}
        {outcome.credits} · Belegverknüpfungen: {outcome.receiptLinks}
      </p>
      {items.length > 0 && (
        <ul aria-label="Verknüpfte Buchungen">
          {items.map((item) => (
            <li key={`${item.role}:${item.bookingId}`}>
              <a
                href={`/konten/buchungen?konto=${encodeURIComponent(item.accountId)}&buchung=${encodeURIComponent(item.bookingId)}`}
              >
                {roles[item.role]}
              </a>
            </li>
          ))}
        </ul>
      )}
      {reasons.length > 0 && (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{automaticReason(reason)}</li>
          ))}
        </ul>
      )}
      <p>
        Automatische Validierung ist keine Bestätigung einer tatsächlich ausgeführten Bankzahlung.
      </p>
    </section>
  );
}
function StatementAutomationSettings({
  accountId,
  accounts,
  disabled,
  suggested,
  onBusy,
  onDirty,
}: {
  accountId: string;
  accounts: { id: string; name: string; currency: string }[];
  disabled: boolean;
  suggested: { token: string; hint: string }[];
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const query = useQuery({
    queryKey: [...KEY, 'automation-config', accountId],
    queryFn: () =>
      request<{ config: StatementAutomationConfig }>(
        'GET',
        `${PATH}/automation/config?accountId=${encodeURIComponent(accountId)}`,
      ),
  });
  const funding = useQuery({
    queryKey: [...LEDGER_KEY, 'statement-settlements', accountId],
    queryFn: () =>
      request<StatementSettlementState>(
        'GET',
        `/api/statement-settlements?cardAccountId=${encodeURIComponent(accountId)}`,
      ),
  });
  const payments = useQuery(expectedQuery());
  const sourceCurrency = accounts.find((account) => account.id === accountId)?.currency;
  const fundingId = funding.data?.config?.enabled ? funding.data.config.fundingAccountId : null;
  const scheduledChoices = (payments.data ?? []).filter(
    (payment) =>
      !payment.deletedAt &&
      payment.kind === 'outflow' &&
      !!fundingId &&
      payment.accountId === fundingId &&
      !!sourceCurrency &&
      payment.version?.currency === sourceCurrency,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StatementAutomationConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedPaymentId =
    draft?.scheduledPayment?.mode === 'existing' ? draft.scheduledPayment.paymentId : null;
  const write = useBudgetWrite();
  const qc = useQueryClient();
  const change = (next: StatementAutomationConfig) => {
    setDraft(next);
    onDirty(true);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(null);
    onDirty(false);
  };
  const save = async () => {
    if (!draft || saving || disabled) return;
    setSaving(true);
    onBusy(true);
    try {
      const result = await write(
        () =>
          request<{ config: StatementAutomationConfig; groupId: string }>(
            'PUT',
            `${PATH}/automation/config`,
            {
              accountId,
              expectedRevision: draft.revision,
              enabled: draft.enabled,
              mappedCards: draft.mappedCards,
              scheduledPayment: draft.scheduledPayment ?? null,
            },
          ),
        () => 'Automatische Abrechnungsverarbeitung eingerichtet.',
      );
      if (result) {
        cancel();
        await qc.invalidateQueries({ queryKey: [...KEY, 'automation-config', accountId] });
      }
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };
  return (
    <details>
      <summary>Automatische Verarbeitung einrichten</summary>
      <p>
        Erst ein PDF hochladen, dann die erkannten Karten einmalig zuordnen. Die Erkennung selbst
        bucht nichts. Nur ausdrücklich zugeordnete Karten und eindeutige vorhandene Zuordnungsregeln
        verwenden. Das Zahlungskonto bleibt in der Einrichtung für den Abrechnungsausgleich
        festgelegt.
      </p>
      {query.isPending && <LoadingNote what="Automatische Abrechnungsverarbeitung" />}
      {query.isError && (
        <ErrorNote
          what="Automatische Abrechnungsverarbeitung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {!editing && query.data && (
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setDraft({
              ...query.data.config,
              mappedCards: query.data.config.mappedCards.map((row) => ({ ...row })),
            });
            setEditing(true);
          }}
        >
          Einrichtung bearbeiten
        </Button>
      )}
      {editing && draft && (
        <div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={disabled || saving}
              onChange={(event) => change({ ...draft, enabled: event.target.checked })}
            />{' '}
            Eindeutige neue Uploads automatisch verarbeiten
          </label>
          <Field label="Bestehende wiederkehrende Abbuchung">
            {({ id }) => (
              <Select
                id={id}
                disabled={disabled || saving}
                value={
                  draft.scheduledPayment?.mode === 'existing'
                    ? draft.scheduledPayment.paymentId
                    : draft.scheduledPayment?.mode === 'none'
                      ? 'none'
                      : ''
                }
                onChange={(event) =>
                  change({
                    ...draft,
                    scheduledPayment:
                      event.target.value === ''
                        ? null
                        : event.target.value === 'none'
                          ? { mode: 'none' }
                          : { mode: 'existing', paymentId: event.target.value },
                  })
                }
              >
                <option value="">Noch nicht festgelegt – Ausgleich bleibt unter Prüfen</option>
                <option value="none">Keine bestehende Zahlung</option>
                {selectedPaymentId &&
                  !scheduledChoices.some((payment) => payment.id === selectedPaymentId) && (
                    <option value={selectedPaymentId}>
                      Gespeicherte Zahlung (derzeit nicht auswählbar)
                    </option>
                  )}
                {scheduledChoices.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {payment.name} ·{' '}
                    {accounts.find((account) => account.id === payment.accountId)?.name ??
                      'Einzugskonto'}{' '}
                    · {payment.version?.currency}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p>
            Eine vorhandene Abbuchungsregel ausdrücklich auswählen oder „Keine bestehende Zahlung“
            festlegen. Zur Auswahl stehen Ausgänge vom eingerichteten Einzugskonto in derselben
            Währung. Der konkrete Fälligkeitstag wird für jede Abrechnung erneut am gedruckten
            Einzugsdatum geprüft.
          </p>
          {(funding.isPending || payments.isPending) && (
            <LoadingNote what="Bestehende Abbuchungen" />
          )}
          {funding.isError && (
            <ErrorNote
              what="Einzugskonto"
              error={funding.error}
              onRetry={() => void funding.refetch()}
            />
          )}
          {payments.isError && (
            <ErrorNote
              what="Bestehende Abbuchungen"
              error={payments.error}
              onRetry={() => void payments.refetch()}
            />
          )}
          {!fundingId && !funding.isPending && !funding.isError && (
            <p>
              Für die Auswahl einer bestehenden Zahlung zuerst das Einzugskonto im
              Abrechnungsausgleich einrichten.
            </p>
          )}
          {suggested.length > 0 && (
            <p>Erkannte Kartenhinweise: {suggested.map((row) => row.hint).join(' · ')}</p>
          )}
          {draft.mappedCards.map((row, index) => (
            <div className="statement-fields-726" key={index}>
              <Field label={`Erkannte Karte ${index + 1}`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={row.token}
                    disabled={disabled || saving}
                    onChange={(event) =>
                      change({
                        ...draft,
                        mappedCards: draft.mappedCards.map((item, at) =>
                          at === index ? { ...item, token: event.target.value } : item,
                        ),
                      })
                    }
                  >
                    <option value="">Erkannte Karte auswählen</option>
                    {row.token && !suggested.some((item) => item.token === row.token) && (
                      <option value={row.token}>Bereits zugeordnete Karte</option>
                    )}
                    {suggested.map((item, at) => (
                      <option key={item.token} value={item.token}>
                        {item.hint} · Karte {at + 1}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={`Zugehöriges Konto ${index + 1}`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={row.accountId}
                    disabled={disabled || saving}
                    onChange={(event) =>
                      change({
                        ...draft,
                        mappedCards: draft.mappedCards.map((item, at) =>
                          at === index ? { ...item, accountId: event.target.value } : item,
                        ),
                      })
                    }
                  >
                    <option value="">Konto auswählen</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button
                variant="ghost"
                disabled={disabled || saving}
                onClick={() =>
                  change({
                    ...draft,
                    mappedCards: draft.mappedCards.filter((_, at) => at !== index),
                  })
                }
              >
                Zuordnung {index + 1} entfernen
              </Button>
            </div>
          ))}
          <p>
            Ein erstes PDF kann zur sicheren Erkennung hochgeladen werden, ohne automatisch zu
            buchen. Danach die angezeigte Karte ausdrücklich dem richtigen Konto zuordnen;
            vollständige Kartennummern werden hier nicht benötigt.
          </p>
          <div className="statement-actions-726">
            <Button
              variant="ghost"
              disabled={disabled || saving || draft.mappedCards.length >= 64}
              onClick={() =>
                change({
                  ...draft,
                  mappedCards: [...draft.mappedCards, { token: '', accountId: '' }],
                })
              }
            >
              Zuordnung hinzufügen
            </Button>
            <Button disabled={disabled || saving} onClick={() => void save()}>
              Einrichtung speichern
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || saving}
              onClick={() =>
                void (async () => {
                  if (
                    !window.confirm(
                      'Eigene Einrichtungsänderungen verwerfen und aktuellen Stand laden?',
                    )
                  )
                    return;
                  setSaving(true);
                  onBusy(true);
                  try {
                    const latest = await query.refetch();
                    if (latest.data && !latest.isError) {
                      setDraft({
                        ...latest.data.config,
                        mappedCards: latest.data.config.mappedCards.map((row) => ({ ...row })),
                      });
                      onDirty(false);
                    }
                  } finally {
                    setSaving(false);
                    onBusy(false);
                  }
                })()
              }
            >
              Stand neu laden
            </Button>
            <Button variant="ghost" disabled={disabled || saving} onClick={cancel}>
              Verwerfen
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}
