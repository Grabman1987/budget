import { Button, Field, Select, TextInput, WideDialog } from '@budget/ui';
import { FileUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { accountsQuery } from '../ledger/queries';
import { PayslipUploadDialog } from '../reports/payslip-panel';
import { postReceipt } from '../receipts/receipt-section';
import { AccountStatementIntake } from '../statement-intake/statement-review-726';
import type { ReceiptProposal } from '@budget/domain';
import { DocumentOutcome } from './document-outcome';
import { proposalToEdit, ReceiptProposalPanel, type ReceiptEdit } from './receipt-proposal';
import './document-upload.css';

export type DetectedType =
  'card_statement' | 'bank_statement' | 'payslip' | 'receipt' | 'unreadable';
export type Classification = {
  type: DetectedType;
  confidence: 'certain' | 'probable' | 'unknown';
  hints: { period?: string; accountHint?: string; mime: string };
  needsPassword: boolean;
  /** Receipt PDFs only: values read from the text layer. */
  receipt?: ReceiptProposal;
};
/** What the owner can choose; unreadable documents are offered as receipts only. */
export type Target = 'card_statement' | 'bank_statement' | 'payslip' | 'receipt';
const LABEL: Record<Target, string> = {
  card_statement: 'Kreditkartenabrechnung',
  bank_statement: 'Kontoauszug',
  payslip: 'Gehaltszettel',
  receipt: 'Beleg',
};
const NEXT: Record<Target, string> = {
  card_statement:
    'Die PDF wird für das gewählte Konto gespeichert und ausgewertet; du prüfst die erkannten Angaben in der Vorschau. Nur wenn für dieses Konto die automatische Abrechnung eingerichtet ist, werden eindeutig belegte Buchungen von selbst erfasst, Unklares bleibt unter Prüfen.',
  bank_statement:
    'Die PDF wird für das gewählte Konto gespeichert und ausgewertet; du prüfst die erkannten Angaben in der Vorschau. Nur wenn für dieses Konto die automatische Abrechnung eingerichtet ist, werden eindeutig belegte Buchungen von selbst erfasst, Unklares bleibt unter Prüfen.',
  payslip:
    'Der Gehaltszettel wird gespeichert und ausgewertet. Sind Gehaltskonto und Arbeitgeber eingerichtet und alles eindeutig, wird die Auszahlung automatisch erfasst oder mit der vorhandenen verknüpft (rückgängig machbar); sonst bleibt sie unter Prüfen.',
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
  | { kind: 'payslip'; file: File; password: string; typeLabel: string };

/**
 * One upload for every document kind. The server only classifies; "Weiter" then hands the same
 * File to the existing receipt, statement-review or payslip flow, which keeps its own behaviour.
 */
export function DocumentUploadButton({
  accountId,
  label = 'Dokument hochladen',
  compact = false,
}: {
  /** Account context: pre-selects the account for statements. */
  accountId?: string | undefined;
  label?: string | undefined;
  /** Icon-only trigger for the top bar; the accessible name stays `label`. */
  compact?: boolean | undefined;
}) {
  // The flow (queries, write helper, hand-off dialogs) mounts on first use only, so a trigger in
  // shared chrome costs nothing until the owner opens it, and the hand-off survives closing.
  const [open, setOpen] = useState(false),
    [mounted, setMounted] = useState(false);
  const start = () => {
    setMounted(true);
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <button type="button" className="icon-btn" aria-label={label} title={label} onClick={start}>
          <FileUp size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : (
        <Button variant="ghost" onClick={start}>
          {label}
        </Button>
      )}
      {mounted && <UploadFlow accountId={accountId} open={open} setOpen={setOpen} />}
    </>
  );
}

function UploadFlow({
  accountId,
  open,
  setOpen,
}: {
  accountId: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [over, setOver] = useState(false),
    [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [result, setResult] = useState<Classification | null>(null),
    [target, setTarget] = useState<Target>('receipt'),
    [account, setAccount] = useState(accountId ?? ''),
    [password, setPassword] = useState(''),
    [done, setDone] = useState<{ label: string; lines: string[] } | null>(null),
    [edit, setEdit] = useState<ReceiptEdit | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const accounts = useQuery({ ...accountsQuery(), enabled: open });
  const write = useBudgetWrite();
  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setPassword('');
    setTarget('receipt');
    setAccount(accountId ?? '');
    setDone(null);
    setEdit(null);
  };
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
        cause instanceof ApiError && cause.message
          ? cause.message
          : 'Die Datei konnte nicht geprüft werden. Bitte erneut versuchen.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function proceed() {
    if (!file || busy) return;
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
    const typed = password,
      typeLabel = LABEL[target];
    if (target === 'payslip') setRoute({ kind: 'payslip', file, password: typed, typeLabel });
    else setRoute({ kind: 'statement', accountId: account, file, password: typed, typeLabel });
    setOpen(false);
    reset();
  }
  const needsAccount = isStatement(target) && !account;
  // Statements and payslips are PDF-only; a photo can only be filed as a receipt.
  const targets = (Object.keys(LABEL) as Target[]).filter(
    (key) => key === 'receipt' || result?.hints.mime === 'application/pdf',
  );
  const detected = result && result.type !== 'unreadable' ? LABEL[result.type] : null;
  return (
    <>
      <WideDialog
        open={open}
        title="Dokument hochladen"
        beforeClose={() => !busy}
        onClose={() => {
          setOpen(false);
          reset();
        }}
      >
        <div className="document-upload-dialog" aria-busy={busy}>
          {!result && !done && (
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
                const files = Array.from(event.dataTransfer.files);
                if (files.length !== 1) setError('Bitte genau eine Datei ablegen.');
                else void inspect(files[0]!);
              }}
            >
              <input
                ref={picker}
                className="sr-only"
                tabIndex={-1}
                type="file"
                accept="image/*,application/pdf,.pdf"
                aria-label="Dokument auswählen"
                disabled={busy}
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0];
                  if (selected) void inspect(selected);
                  event.currentTarget.value = '';
                }}
              />
              <Button disabled={busy} onClick={() => picker.current?.click()}>
                Datei auswählen
              </Button>
              <p className="document-upload-next">
                Foto oder PDF, höchstens 15 MB. Die App erkennt, ob es eine Abrechnung, ein
                Gehaltszettel oder ein Beleg ist. Gespeichert wird erst nach „Weiter“.
              </p>
              {busy && <p role="status">Dokument wird geprüft …</p>}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {done && (
            <>
              <DocumentOutcome
                typeLabel={done.label}
                lines={done.lines}
                onNavigate={() => {
                  setOpen(false);
                  reset();
                }}
              />
              <div className="document-upload-actions">
                <Button
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Fertig
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Weiteres Dokument
                </Button>
              </div>
            </>
          )}
          {result && file && !done && (
            <>
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
                      ? `Im Dokument steht Karte ${result.hints.accountHint}. Bitte das Konto selbst wählen.`
                      : undefined
                  }
                >
                  {({ id }) => (
                    <Select
                      id={id}
                      value={account}
                      disabled={busy || accounts.isPending}
                      onChange={(event) => setAccount(event.target.value)}
                    >
                      <option value="">Konto wählen</option>
                      {accounts.data?.accounts.map((row) => (
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
              <p className="document-upload-next">{NEXT[target]}</p>
              <div className="document-upload-actions">
                <Button disabled={busy || needsAccount} onClick={() => void proceed()}>
                  Weiter
                </Button>
                <Button variant="ghost" disabled={busy} onClick={reset}>
                  Andere Datei
                </Button>
              </div>
            </>
          )}
        </div>
      </WideDialog>
      {route?.kind === 'statement' && (
        <AccountStatementIntake
          accountId={route.accountId}
          handoff={{ file: route.file, password: route.password, typeLabel: route.typeLabel }}
          onHandoffClose={() => setRoute(null)}
        />
      )}
      {route?.kind === 'payslip' && (
        <PayslipUploadDialog
          onClose={() => setRoute(null)}
          handoff={{ file: route.file, password: route.password, typeLabel: route.typeLabel }}
        />
      )}
    </>
  );
}
