import { Button, Field, Select, TextInput, WideDialog } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NoticeArchive } from './notice-archive';
import { ApiError } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { accountsQuery } from '../ledger/queries';
import { PayslipUploadDialog } from '../reports/payslip-panel';
import { postReceipt } from '../receipts/receipt-section';
import { AccountStatementIntake } from '../statement-intake/statement-review-726';
import type { ReceiptProposal, TradeConfirmationIntake } from '@budget/domain';
import { DocumentOutcome } from './document-outcome';
import { proposalToEdit, ReceiptProposalPanel, type ReceiptEdit } from './receipt-proposal';
import { TradeConfirmationHandoff, TradeConfirmationSummary } from './trade-confirmation';
import './document-upload.css';

export type DetectedType =
  | 'card_statement'
  | 'bank_statement'
  | 'payslip'
  | 'bonus'
  | 'pension'
  | 'trade_confirmation'
  | 'receipt'
  | 'unreadable';
export type Classification = {
  type: DetectedType;
  confidence: 'certain' | 'probable' | 'unknown';
  hints: { period?: string; accountHint?: string; mime: string };
  needsPassword: boolean;
  /** Receipt PDFs only: values read from the text layer. */
  receipt?: ReceiptProposal;
  /** Broker trade confirmations only: the trade form proposal and its duplicate state. */
  trade?: TradeConfirmationIntake;
};
/** What the owner can choose; unreadable documents are offered as receipts only. */
export type Target =
  | 'card_statement'
  | 'bank_statement'
  | 'payslip'
  | 'bonus'
  | 'pension'
  | 'trade_confirmation'
  | 'receipt';
const LABEL: Record<Target, string> = {
  card_statement: 'Kreditkartenabrechnung',
  bank_statement: 'Kontoauszug',
  payslip: 'Gehaltszettel',
  trade_confirmation: 'Wertpapierabrechnung',
  receipt: 'Beleg',
  bonus: 'Bonus-Mitteilung',
  pension: 'Pensionskassen-Mitteilung',
};
const NEXT: Record<Target, string> = {
  card_statement:
    'Die PDF wird für das gewählte Konto gespeichert und ausgewertet; du prüfst die erkannten Angaben in der Vorschau. Nur wenn für dieses Konto die automatische Abrechnung eingerichtet ist, werden eindeutig belegte Buchungen von selbst erfasst, Unklares bleibt unter Prüfen.',
  bank_statement:
    'Die PDF wird für das gewählte Konto gespeichert und ausgewertet; du prüfst die erkannten Angaben in der Vorschau. Nur wenn für dieses Konto die automatische Abrechnung eingerichtet ist, werden eindeutig belegte Buchungen von selbst erfasst, Unklares bleibt unter Prüfen.',
  payslip:
    'Der Gehaltszettel wird gespeichert und ausgewertet. Sind Gehaltskonto und Arbeitgeber eingerichtet und alles eindeutig, wird die Auszahlung automatisch erfasst oder mit der vorhandenen verknüpft (rückgängig machbar); sonst bleibt sie unter Prüfen.',
  bonus:
    'Das Original bleibt mit seiner Klassifikation im Mitteilungsarchiv auffindbar. Der Gehaltsimport-Vorschlag wird verworfen. Es wird nichts gebucht.',
  pension:
    'Das Original bleibt mit seiner Klassifikation im Mitteilungsarchiv auffindbar. Der Gehaltsimport-Vorschlag wird verworfen. Es wird nichts gebucht.',
  trade_confirmation:
    'Es öffnet sich „Handel erfassen“ mit den gelesenen Angaben als Vorschlag. Gespeichert wird erst, wenn du dort bestätigst; die PDF selbst wird dabei nicht abgelegt.',
  receipt: 'Die Datei wird als Beleg unter Prüfen abgelegt. Es wird nichts gebucht.',
};
const isStatement = (t: Target) => t === 'card_statement' || t === 'bank_statement';
const MAX = 15 * 1024 * 1024;

async function classify(file: File, password: string): Promise<Classification> {
  const body = new FormData();
  body.set('file', file);
  if (password) body.set('password', password);
  let response: Response;
  try {
    response = await fetch('/api/document-intake/classify', {
      method: 'POST',
      body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const result = (await response.json().catch(() => ({}))) as Classification & {
    error?: string;
    message?: string;
  };
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'unknown', result.message);
  return result;
}

type Route =
  | { kind: 'statement'; accountId: string; file: File; password: string; typeLabel: string }
  | { kind: 'payslip'; file: File; password: string; typeLabel: string }
  | { kind: 'trade'; intake: TradeConfirmationIntake };

export function UploadFlow({
  accountId,
  open,
  setOpen,
}: {
  accountId: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [entries, setEntries] = useState<{ id: number; file: File }[]>([]);
  const [over, setOver] = useState(false);
  const handoff = useRef(false);
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const previousAccounts = useRef<Partial<Record<Target, string>>>({});
  const add = (files: File[]) =>
    setEntries((rows) => [...rows, ...files.map((file) => ({ id: sequence.current++, file }))]);
  const remove = (id: number) => {
    setEntries((rows) => rows.filter((row) => row.id !== id));
    setBusy((rows) => {
      const next = { ...rows };
      delete next[id];
      return next;
    });
  };
  return (
    <>
      <WideDialog
        open={open}
        title="Dokument hochladen"
        beforeClose={() => !handoff.current && !Object.values(busy).some(Boolean)}
        onClose={() => {
          setOpen(false);
          setEntries([]);
          setBusy({});
        }}
      >
        {/* Delegated outcome navigation includes keyboard-generated link clicks. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className="document-upload-dialog"
          onClick={(event) => {
            // A nested outcome must finish its discard/busy guard before the batch can close.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            const link = event.target instanceof Element ? event.target.closest('a') : null;
            if (link?.getAttribute('href') !== '/konten/pruefen' || handoff.current) return;
            setOpen(false);
            setEntries([]);
            setBusy({});
          }}
        >
          <div
            className="document-upload-drop"
            data-over={over}
            role="region"
            aria-label="Dokument ablegen"
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              add(Array.from(event.dataTransfer.files));
            }}
          >
            <input
              ref={picker}
              className="sr-only"
              tabIndex={-1}
              type="file"
              multiple
              accept="image/*,application/pdf,.pdf"
              aria-label="Dokument auswählen"
              onChange={(event) => {
                add(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = '';
              }}
            />
            <Button onClick={() => picker.current?.click()}>Datei auswählen</Button>
            <p className="document-upload-next">
              Mehrere Fotos oder PDFs auswählen oder ablegen, höchstens 15 MB je Datei. Jede Datei
              wird getrennt geprüft. Gespeichert wird erst nach „Weiter“ bei der jeweiligen Datei.
            </p>
          </div>
          <NoticeArchive enabled={open} />
          {entries.map(({ id, file }) => (
            <UploadEntry
              key={id}
              initialFile={file}
              accountId={accountId}
              onRemove={() => remove(id)}
              onFinish={() => {
                remove(id);
                if (entries.length === 1) setOpen(false);
              }}
              onNavigate={() => {
                setOpen(false);
                setEntries([]);
                setBusy({});
              }}
              onHandoff={(active) => {
                handoff.current = active;
              }}
              onBusy={(value) =>
                setBusy((rows) => (rows[id] === value ? rows : { ...rows, [id]: value }))
              }
              remember={(target, account) => {
                previousAccounts.current[target] = account;
              }}
              suggest={(target) => previousAccounts.current[target]}
            />
          ))}
        </div>
      </WideDialog>
    </>
  );
}

function UploadEntry({
  initialFile,
  accountId,
  onRemove,
  onFinish,
  onNavigate,
  onHandoff,
  onBusy,
  remember,
  suggest,
}: {
  initialFile: File;
  accountId: string | undefined;
  onRemove: () => void;
  onFinish: () => void;
  onNavigate: () => void;
  onHandoff: (active: boolean) => void;
  onBusy: (busy: boolean) => void;
  remember: (target: Target, account: string) => void;
  suggest: (target: Target) => string | undefined;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(initialFile),
    [result, setResult] = useState<Classification | null>(null),
    [target, setTarget] = useState<Target>('receipt'),
    [account, setAccount] = useState<string | null>(null),
    [password, setPassword] = useState(''),
    [done, setDone] = useState<{ label: string; lines: string[] } | null>(null),
    [edit, setEdit] = useState<ReceiptEdit | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [reviewClosed, setReviewClosed] = useState(false);
  const accounts = useQuery(accountsQuery());
  const write = useBudgetWrite();
  const reset = onRemove;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void inspect(initialFile);
    // Each row inspects its original File once; retries are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  const eligibleAccounts = accounts.data?.accounts.filter((row) => !row.closedAt);
  const candidates = eligibleAccounts?.filter((row) =>
    target === 'card_statement'
      ? row.type === 'credit_card'
      : row.type === 'checking' || row.type === 'savings',
  );
  const proposed =
    accountId ?? suggest(target) ?? (candidates?.length === 1 ? candidates[0]?.id : undefined);
  const selectedAccount = account ?? eligibleAccounts?.find((row) => row.id === proposed)?.id ?? '';
  async function inspect(next: File, typed = '') {
    if (busy) return;
    setError('');
    if (!next.size || next.size > MAX) {
      setError('Bitte eine Datei bis 15 MB auswählen.');
      return;
    }
    setFile(next);
    setBusy(true);
    try {
      const found = await classify(next, typed);
      setResult(found);
      setTarget(found.type === 'unreadable' ? 'receipt' : found.type);
      setEdit(found.receipt ? proposalToEdit(found.receipt) : null);
      // A typed password that still does not open the PDF is reported, not silently re-asked.
      if (typed && found.needsPassword) setError('Passwort falsch. Bitte erneut eingeben.');
    } catch (cause) {
      setResult(null);
      setError(
        cause instanceof ApiError && cause.detail
          ? cause.detail
          : 'Die Datei konnte nicht geprüft werden. Bitte erneut versuchen.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function proceed() {
    if (!file || busy) return;
    setError('');
    if (target === 'bonus' || target === 'pension') {
      setBusy(true);
      let saved = false;
      await write(
        async () => {
          const body = new FormData();
          body.set('file', file);
          if (password) body.set('password', password);
          const response = await fetch('/api/document-intake/notices', {
            method: 'POST',
            body,
            credentials: 'same-origin',
          });
          if (!response.ok) throw new ApiError(response.status, 'archive_failed');
          const reply = (await response.json()) as { groupId: string };
          saved = true;
          setDone({
            label: LABEL[target],
            lines: [
              'Original: im Mitteilungsarchiv gespeichert.',
              `Klassifikation: ${LABEL[target]}.`,
              'Gehaltsimport-Vorschlag: verworfen. Es wurde nichts gebucht.',
            ],
          });
          return reply;
        },
        () => 'Mitteilung archiviert.',
      );
      setBusy(false);
      if (!saved) setError('Die Datei konnte nicht gespeichert werden. Bitte erneut versuchen.');
      return;
    }
    if (target === 'receipt') {
      setBusy(true);
      let saved = false;
      const attachTo = edit?.bookingId || undefined;
      await write(
        async () => {
          const reply = await postReceipt(file, attachTo);
          saved = true;
          return reply;
        },
        () => 'Beleg unter Prüfen gespeichert.',
      );
      setBusy(false);
      if (!saved) setError('Die Datei konnte nicht gespeichert werden. Bitte erneut versuchen.');
      // On failure the write helper reports it; keep the dialog and the file for a retry.
      if (saved)
        setDone({
          label: LABEL.receipt,
          lines: [
            attachTo
              ? 'Beleg an die gewählte Buchung angehängt.'
              : 'Als Beleg unter Prüfen abgelegt. Es wurde nichts gebucht.',
          ],
        });
      return;
    }
    if (target === 'trade_confirmation') {
      if (!result?.trade || result.trade.duplicate) return;
      // The existing trade form opens on top; nothing is saved before its confirmation.
      setRoute({ kind: 'trade', intake: result.trade });
      onHandoff(true);
      return;
    }
    const typed = password,
      typeLabel = LABEL[target];
    if (target === 'payslip') setRoute({ kind: 'payslip', file, password: typed, typeLabel });
    else {
      remember(target, selectedAccount);
      setRoute({ kind: 'statement', accountId: selectedAccount, file, password: typed, typeLabel });
    }
    onHandoff(true);
  }
  const needsAccount = isStatement(target) && !selectedAccount;
  // Statements and payslips are PDF-only; a photo can only be filed as a receipt.
  const targets = (Object.keys(LABEL) as Target[]).filter(
    (key) =>
      ((key !== 'bonus' && key !== 'pension' && key !== 'trade_confirmation') ||
        result?.type === key) &&
      (key === 'receipt' || result?.hints.mime === 'application/pdf'),
  );
  const tradeBlocked =
    target === 'trade_confirmation' && (!result?.trade || !!result.trade.duplicate);
  const detected = result && result.type !== 'unreadable' ? LABEL[result.type] : null;
  return (
    <>
      <section className="document-upload-entry" aria-label={initialFile.name} aria-busy={busy}>
        <strong className="document-upload-next">{initialFile.name}</strong>
        {busy && <p role="status">Dokument wird geprüft …</p>}
        {!result && !busy && !done && <p>Status: Nicht geprüft</p>}
        {error && !result && (
          <Button disabled={busy} onClick={() => void inspect(initialFile)}>
            Erneut versuchen
          </Button>
        )}
        {error && <p role="alert">{error}</p>}
        {done && (
          <>
            <DocumentOutcome typeLabel={done.label} lines={done.lines} onNavigate={onNavigate} />
            <div className="document-upload-actions">
              <Button onClick={onFinish}>Fertig</Button>
              <Button variant="ghost" onClick={reset}>
                Weiteres Dokument
              </Button>
            </div>
          </>
        )}
        {result && file && !done && (
          <>
            <p>
              Status:{' '}
              {reviewClosed
                ? 'Einzelprüfung geschlossen; Ergebnis unter Prüfen ansehen.'
                : 'Bereit zur Bestätigung'}
            </p>
            {!isStatement(target) && (
              <p>
                Konto:{' '}
                {target === 'payslip' ? 'in der Gehaltsprüfung' : 'bei der Buchungszuordnung'}
              </p>
            )}
            <p role="status">
              {detected
                ? `Erkannt: ${detected}${result.confidence === 'certain' ? '' : ' (nicht ganz sicher)'}`
                : result.needsPassword
                  ? 'Das PDF ist passwortgeschützt.'
                  : 'Dieses Dokument konnte nicht gelesen werden.'}
            </p>
            {result.needsPassword && (
              <>
                <Field label="PDF-Passwort">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      type="password"
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  )}
                </Field>
                <Button disabled={busy || !password} onClick={() => void inspect(file, password)}>
                  Mit Passwort prüfen
                </Button>
              </>
            )}
            <Field label="Dokumenttyp">
              {({ id }) => (
                <Select
                  id={id}
                  value={target}
                  disabled={busy}
                  onChange={(event) => setTarget(event.target.value as Target)}
                >
                  {targets.map((key) => (
                    <option key={key} value={key}>
                      {LABEL[key]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {isStatement(target) && (
              <Field
                label="Konto"
                hint={
                  result.hints.accountHint
                    ? `Im Dokument steht Karte ${result.hints.accountHint}. Bitte den Konto-Vorschlag prüfen.`
                    : 'Konto-Vorschlag prüfen oder ändern.'
                }
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={selectedAccount}
                    disabled={busy || accounts.isPending}
                    onChange={(event) => setAccount(event.target.value)}
                  >
                    <option value="">Konto wählen</option>
                    {eligibleAccounts?.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {target === 'receipt' && edit && (
              <ReceiptProposalPanel value={edit} onChange={setEdit} disabled={busy} />
            )}
            {target === 'trade_confirmation' && result.trade && (
              <TradeConfirmationSummary intake={result.trade} />
            )}
            {!tradeBlocked && <p className="document-upload-next">{NEXT[target]}</p>}
            <div className="document-upload-actions">
              <Button
                disabled={busy || needsAccount || tradeBlocked}
                onClick={() => void proceed()}
              >
                {target === 'bonus' || target === 'pension'
                  ? 'Als Bonus-/Pensionsmitteilung archivieren; keinen Gehaltsimport erstellen'
                  : 'Weiter'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={reset}>
                Andere Datei
              </Button>
            </div>
          </>
        )}
      </section>
      {route?.kind === 'statement' &&
        createPortal(
          <AccountStatementIntake
            accountId={route.accountId}
            handoff={{ file: route.file, password: route.password, typeLabel: route.typeLabel }}
            onHandoffClose={() => {
              setRoute(null);
              setReviewClosed(true);
              onHandoff(false);
            }}
          />,
          document.body,
        )}
      {route?.kind === 'trade' &&
        createPortal(
          <TradeConfirmationHandoff
            intake={route.intake}
            onClose={() => {
              setRoute(null);
              onHandoff(false);
            }}
            onSaved={() => {
              setRoute(null);
              onHandoff(false);
              setDone({
                label: LABEL.trade_confirmation,
                lines: [
                  'Handel aus der Abrechnung erfasst. Er steht im Handelsverlauf des Instruments.',
                ],
              });
            }}
          />,
          document.body,
        )}
      {route?.kind === 'payslip' &&
        createPortal(
          <PayslipUploadDialog
            onClose={() => {
              setRoute(null);
              setReviewClosed(true);
              onHandoff(false);
            }}
            handoff={{ file: route.file, password: route.password, typeLabel: route.typeLabel }}
          />,
          document.body,
        )}
    </>
  );
}
