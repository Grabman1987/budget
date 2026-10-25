import {
  payrollTotals,
  type ParsedPayrollDocument,
  type PayslipSourceConfig,
  type PayslipAutomationOutcome,
} from '@budget/domain';
import { Button, Field, SectionHead, Select, TextInput, useToast, WideDialog } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, notifyApiWrite, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { AccountOptions } from '../ledger/account-options';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { AccountRow } from '../ledger/types';
import './payslip-intake.css';

const PATH = '/api/payslip-intake';
type RememberResult = 'saved' | 'unavailable' | 'not_opened' | 'off';
const rememberText = (r?: RememberResult) =>
  r === 'saved'
    ? 'Passwort für künftige Uploads gemerkt.'
    : r === 'unavailable'
      ? 'Passwort nicht gemerkt: Am Server fehlt BUDGET_PEPPER.'
      : r === 'not_opened'
        ? 'Passwort nicht gemerkt: Es hat dieses PDF nicht geöffnet.'
        : '';
/** Optional PDF password. Kept in component state only and cleared after each request. */
function PasswordFields({
  password,
  remember,
  disabled,
  onPassword,
  onRemember,
  legend,
}: {
  password: string;
  remember: boolean;
  disabled: boolean;
  onPassword: (value: string) => void;
  onRemember: (value: boolean) => void;
  legend: string;
}) {
  return (
    <div className="payslip-password">
      <Field label={legend}>
        {({ id }) => (
          <TextInput
            id={id}
            type="password"
            autoComplete="off"
            maxLength={256}
            value={password}
            disabled={disabled}
            onChange={(e) => onPassword(e.target.value)}
          />
        )}
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={remember}
          disabled={disabled}
          onChange={(e) => onRemember(e.target.checked)}
        />{' '}
        Für künftige Uploads merken
      </label>
    </div>
  );
}
export type PayslipUploadResult = {
  id: string;
  duplicate: boolean;
  dropboxCopy?: 'saved' | 'failed' | 'off';
  passwordRemember?: RememberResult;
  automation?: PayslipAutomationOutcome;
};
export function PayslipUpload({
  onBusyChange,
  onUploaded,
}: {
  onBusyChange?: (busy: boolean) => void;
  onUploaded?: (result: PayslipUploadResult) => void;
} = {}) {
  const picker = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [dropbox, setDropbox] = useState<'saved' | 'failed' | 'off'>('off'),
    [password, setPassword] = useState(''),
    [remember, setRemember] = useState(false),
    [rememberNote, setRememberNote] = useState('');
  const qc = useQueryClient();
  const acknowledgeWrite = useBudgetWrite();
  const toast = useToast();
  function receive(files: File[]) {
    if (busy || !files.length) return;
    const file = files[0]!;
    if (files.length !== 1 || (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) {
      setError('Bitte genau eine PDF-Datei ablegen oder auswählen.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Eine PDF darf höchstens 15 MB groß sein.');
      return;
    }
    void upload(file);
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    setDropbox('off');
    setRememberNote('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('automation', 'eligible');
      if (password) {
        body.set('password', password);
        if (remember) body.set('remember', '1');
      }
      const response = await fetch(PATH + '/upload', {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as {
        id: string;
        duplicate: boolean;
        dropboxCopy?: 'saved' | 'failed' | 'off';
        passwordRemember?: RememberResult;
        automation?: PayslipAutomationOutcome;
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new ApiError(response.status, result.error ?? 'unknown', result.message);
      if (!result.id) throw new ApiError(0, 'invalid_upload_response');
      notifyApiWrite();
      setMessage(
        result.automation?.status === 'booked'
          ? 'Gehaltszettel gespeichert und Auszahlung erfasst.'
          : result.automation?.status === 'linked'
            ? 'Gehaltszettel gespeichert und mit der vorhandenen Auszahlung verknüpft.'
            : result.duplicate
              ? 'Dieses PDF wurde bereits aufgenommen. Die vorhandene Abrechnung wird geöffnet.'
              : 'PDF gespeichert. Nicht eindeutige Angaben bleiben unter Prüfen.',
      );
      setDropbox(result.duplicate ? 'off' : (result.dropboxCopy ?? 'off'));
      setRememberNote(rememberText(result.passwordRemember));
      if (result.automation?.groupId && ['booked', 'linked'].includes(result.automation.status)) {
        // Acknowledge the already committed financial group through the shared Undo/redo UI.
        // The earlier staging group is deliberately NOT the financial Undo target.
        const groupId = result.automation.groupId;
        await acknowledgeWrite(async () => ({ groupId }), () => 'Gehaltszettel automatisch gespeichert.');
      }
      if (result.automation?.status === 'pruefen') {
        const reason = result.automation.reason;
        toast.show({ message: reason === 'source_not_configured'
          ? 'PDF gespeichert. Bitte Gehaltskonto und Arbeitgeber/Absender einmal einrichten.'
          : reason === 'payroll_already_exists'
            ? 'PDF gespeichert. Eine Abrechnung ist bereits erfasst; bitte die Zuordnung unter Prüfen kontrollieren.'
            : 'PDF gespeichert. Auszahlung oder Angaben sind nicht eindeutig; bitte unter Prüfen kontrollieren.' });
      }
      onUploaded?.(result);
      await qc.invalidateQueries();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPassword('');
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div
      className="payslip-upload"
      role="region"
      aria-label="Gehaltszettel-PDF ablegen"
      aria-busy={busy}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        receive(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={picker}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Gehaltszettel-PDF auswählen"
        disabled={busy}
        onChange={(e) => {
          receive(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Button variant="ghost" disabled={busy} onClick={() => picker.current?.click()}>
        Gehaltszettel hochladen
      </Button>
      <span>PDF · höchstens 15 MB{busy ? ' · Wird ausgewertet …' : ''}</span>
      <p className="payslip-drop-hint">PDF hier ablegen oder über den Button auswählen.</p>
      <p>Mit eingerichteter Gehaltsquelle werden eindeutige neue Gehaltszettel automatisch gespeichert
        und passende Auszahlungen verknüpft. Neue Auszahlungen werden vorgemerkt (Bargeld bestätigt).
        Unklare Angaben bleiben unter Prüfen.</p>
      <details className="payslip-password-details">
        <summary>PDF-Passwort eingeben (optional)</summary>
        <PasswordFields
          legend="PDF-Passwort"
          password={password}
          remember={remember}
          disabled={busy}
          onPassword={setPassword}
          onRemember={setRemember}
        />
      </details>
      {message && <p role="status">{message}</p>}
      {message && dropbox === 'saved' && <p role="status">In Dropbox abgelegt</p>}
      {message && dropbox === 'failed' && (
        <p role="status">Dropbox-Ablage fehlgeschlagen – Datei liegt sicher in der App</p>
      )}
      {message && rememberNote && <p role="status">{rememberNote}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
type Intake = {
  id: string;
  receiptId: string;
  /** Older responses may omit the live, persisted source association. */
  payout?: { payslipId: string; bookingId: string; accountId: string } | null;
  status: string;
  parsed: ParsedPayrollDocument & {
    unmappedWageTypes?: { code: string; label: string; amountCents: number }[];
  };
  payoutAccountId: string | null;
  proposedPayoutDate: string | null;
  accounts: SourceStatus['accounts'];
  matches: {
    id: string;
    date: string;
    amountCents: number;
    differenceCents: number;
    exact: boolean;
  }[];
  proposedPayeeId: string | null;
  selectedExpectedOccurrenceId: string | null;
  expectedPayouts: {
    occurrenceId: string;
    paymentId: string;
    name: string;
    dueDate: string;
    amountCents: number;
    currency: string;
    accountId: string;
    payeeId: string | null;
    payeeName: string | null;
  }[];
  payees: { id: string; name: string }[];
};
export function PayslipIntakeDetail({
  id,
  inline = false,
  duplicate = false,
}: {
  id: string;
  /** Render the expanded review inside the upload dialog instead of opening another dialog. */
  inline?: boolean;
  duplicate?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>();
  const [payoutDate, setPayoutDate] = useState<string | null | undefined>();
  const [expectedOccurrenceId, setExpectedOccurrenceId] = useState<string | null | undefined>();
  const [payeeId, setPayeeId] = useState<string | null | undefined>();
  const [wageMappings, setWageMappings] = useState<Record<string, string>>({});
  const [mappingPassword, setMappingPassword] = useState('');
  const query = useQuery({
    queryKey: ['payslip-intake', id, accountId, payoutDate, expectedOccurrenceId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      if (payoutDate) params.set('payoutDate', payoutDate);
      if (expectedOccurrenceId) params.set('expectedOccurrenceId', expectedOccurrenceId);
      return request<Intake>('GET', `${PATH}/${id}${params.size ? `?${params}` : ''}`);
    },
    enabled: inline || dialogOpen,
  });
  const [bookingId, setBookingId] = useState<string | undefined>(),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(''),
    [remember, setRemember] = useState(false);
  const write = useBudgetWrite();
  const data = query.isSuccess && !query.isFetching ? query.data : undefined;
  const effectiveExpectedId =
    expectedOccurrenceId !== undefined ? expectedOccurrenceId : data?.selectedExpectedOccurrenceId;
  const match =
    bookingId ??
    (data?.matches.filter((m) => m.exact).length === 1
      ? data.matches.find((m) => m.exact)!.id
      : '');
  const p = data?.parsed,
    totals = p?.draft ? payrollTotals([p.draft]) : null;
  const selectedMatch = data?.matches.find((m) => m.id === match);
  const payoutAccount = data?.accounts.find((a) => a.id === data.payoutAccountId);
  const selectedExpectation = data?.expectedPayouts.find(
    (item) => item.occurrenceId === effectiveExpectedId,
  );
  const effectivePayeeId =
    payeeId !== undefined
      ? payeeId
      : expectedOccurrenceId === null
        ? null
        : (selectedExpectation?.payeeId ?? data?.proposedPayeeId ?? null);
  const effectiveDate =
    payoutDate !== undefined ? (payoutDate ?? '') : data?.proposedPayoutDate || '';
  const validEffectiveDate = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return false;
    const date = new Date(`${effectiveDate}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === effectiveDate;
  })();
  const canConfirm = Boolean(
    p?.draft &&
    !(p.unmappedWageTypes?.length ?? 0) &&
    validEffectiveDate &&
    (match || payoutAccount) &&
    Math.abs(p.differenceCents ?? 2) <= 1 &&
    p.warnings.every((w) => w === 'Abrechnungsmonat nur aus dem Dateinamen erkannt.'),
  );
  async function act(action: 'confirm' | 'reject' | 'retry') {
    if (busy) return;
    setBusy(true);
    await write(
      () =>
        request<{ groupId: string }>(
          'POST',
          `${PATH}/${id}/${action === 'retry' ? 'retry' : 'decision'}`,
          action === 'retry'
            ? password
              ? { password, ...(remember ? { remember: true } : {}) }
              : {}
            : {
                action,
                bookingId: match || null,
                ...(action === 'confirm' && payoutAccount
                  ? {
                      accountId: payoutAccount.id,
                      payoutDate: effectiveDate,
                      payeeId: effectivePayeeId,
                      ...(expectedOccurrenceId !== undefined
                        ? { expectedOccurrenceId }
                        : effectiveExpectedId
                          ? { expectedOccurrenceId: effectiveExpectedId }
                          : {}),
                    }
                  : {}),
              },
        ),
      () =>
        action === 'confirm'
          ? 'Gehaltszettel gespeichert.'
          : action === 'reject'
            ? 'Gehaltszettel verworfen.'
            : 'PDF erneut ausgewertet.',
    );
    if (action === 'retry') setPassword('');
    setBusy(false);
  }
  async function saveMappings() {
    if (!data || busy) return;
    setBusy(true);
    await write(
      () =>
        request<Intake & { groupId: string }>('PUT', `${PATH}/${id}/mappings`, {
          wageTypes: Object.fromEntries(
            Object.entries(wageMappings).filter(([, section]) => Boolean(section)),
          ),
          ...(mappingPassword ? { password: mappingPassword } : {}),
        }),
      () => 'Lohnarten gespeichert und PDF neu ausgewertet.',
    );
    setMappingPassword('');
    setBusy(false);
  }
  const review = (
    <>
      {query.isFetching && <LoadingNote what="Gehaltszettel" />}
      {query.isError && (
        <ErrorNote what="Gehaltszettel" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <>
          <p>
            {p?.documentType === 'bonus'
              ? 'Mitarbeiterbonus'
              : p?.documentType === 'pension'
                ? 'Pensionskassen-Mitteilung'
                : 'Gehaltszettel'}
          </p>
          {p?.warnings.map((w) => (
            <p key={w} role="status">
              {w}
            </p>
          ))}
          {p?.warnings.some((w) => w.startsWith('PDF-Passwort')) && (
            <PasswordFields
              legend="PDF-Passwort"
              password={password}
              remember={remember}
              disabled={busy || data.status !== 'pending'}
              onPassword={setPassword}
              onRemember={setRemember}
            />
          )}
          {totals && (
            <>
              <dl className="source-status">
                {[
                  ['Brutto', totals.grossCents],
                  ['SV-DN inkl. Aufrollung', totals.svCents],
                  ['Lohnsteuer inkl. Aufrollung', totals.taxCents],
                  ['Sonstige Abzüge', totals.otherCents],
                  ['Steuerfreie Erstattungen', totals.reimbursementsCents],
                  ['Auszahlung', totals.netCents],
                  ['Summendifferenz', p!.differenceCents!],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{eur(value as number)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Summenprüfung:{' '}
                {Math.abs(p!.differenceCents!) <= 1 ? 'innerhalb 1 Cent' : 'abweichend'}
                {Math.abs(p!.differenceCents!) === 1
                  ? ' · 1 Cent wird als Rundungszeile gespeichert.'
                  : ''}
              </p>
              {p?.draft?.lines.map((l, i) => (
                <p key={i}>
                  {l.label}: {eur(l.amountCents)}
                  {l.section === 'reimbursement' ? ' · steuerfreie Erstattung' : ''}
                </p>
              ))}
              <Field label="Auszahlungskonto">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={data.payoutAccountId ?? ''}
                    disabled={busy}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      setBookingId(undefined);
                    }}
                  >
                    <option value="" disabled>
                      Konto auswählen
                    </option>
                    <AccountOptions accounts={data.accounts} />
                  </Select>
                )}
              </Field>
              <div className="payslip-review-fields">
                <Field label="Auszahlungsdatum">
                  {({ id: fieldId }) => (
                    <TextInput
                      id={fieldId}
                      type="date"
                      value={effectiveDate}
                      disabled={busy}
                      onChange={(e) => {
                        setPayoutDate(e.target.value || null);
                        setBookingId(undefined);
                      }}
                    />
                  )}
                </Field>
                <Field label="Gehalts-Erwartung">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={effectiveExpectedId ?? ''}
                      disabled={busy}
                      onChange={(e) => {
                        setExpectedOccurrenceId(e.target.value || null);
                        setPayoutDate(undefined);
                        setBookingId(undefined);
                      }}
                    >
                      <option value="">Keine auswählen</option>
                      {data.expectedPayouts.map((item) => (
                        <option value={item.occurrenceId} key={item.occurrenceId}>
                          {item.name} · {longDay(item.dueDate)} · {eur(item.amountCents)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Von">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={effectivePayeeId ?? ''}
                      disabled={busy}
                      onChange={(e) => setPayeeId(e.target.value || null)}
                    >
                      <option value="">Kein Zahlungspartner</option>
                      {data.payees.map((payee) => (
                        <option value={payee.id} key={payee.id}>
                          {payee.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {selectedExpectation && (
                <p>
                  Erwarteter Bezug: {selectedExpectation.name} ·{' '}
                  {eur(selectedExpectation.amountCents)} am {longDay(selectedExpectation.dueDate)}
                  {selectedExpectation.payeeName ? ` · Von ${selectedExpectation.payeeName}` : ''}
                  {selectedExpectation.amountCents !== p?.draft?.netCents
                    ? ` · Differenz zur Auszahlung ${eur(selectedExpectation.amountCents - (p?.draft?.netCents ?? 0))}`
                    : ''}
                </p>
              )}
              {!validEffectiveDate && <p>Bitte ein gültiges Auszahlungsdatum eintragen.</p>}
              {(p?.unmappedWageTypes?.length ?? 0) > 0 && (
                <section aria-label="Unbekannte Lohnarten">
                  <h3>Unbekannte Lohnarten zuordnen</h3>
                  <p>Die Auswertung wird erst nach der Zuordnung erneut gerechnet.</p>
                  {p!.unmappedWageTypes!.map((item) => (
                    <Field
                      key={item.code}
                      label={`${item.label} (${item.code}) · ${eur(item.amountCents)}`}
                    >
                      {({ id: fieldId }) => (
                        <Select
                          id={fieldId}
                          value={wageMappings[item.code] ?? ''}
                          onChange={(e) =>
                            setWageMappings({ ...wageMappings, [item.code]: e.target.value })
                          }
                        >
                          <option value="">Zuordnung auswählen</option>
                          {[
                            ['earning', 'Bezüge'],
                            ['deduction', 'Abzüge'],
                            ['reimbursement', 'Steuerfreie Erstattungen'],
                            ['tax_adjustment', 'Lohnsteuer'],
                            ['sv_adjustment', 'Sozialversicherung'],
                          ].map(([section, label]) => (
                            <option key={section} value={section}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ))}
                  <Field label="PDF-Passwort für erneute Auswertung (optional)">
                    {({ id: fieldId }) => (
                      <TextInput
                        id={fieldId}
                        type="password"
                        autoComplete="off"
                        maxLength={256}
                        value={mappingPassword}
                        disabled={busy}
                        onChange={(e) => setMappingPassword(e.target.value)}
                      />
                    )}
                  </Field>
                  <Button
                    disabled={
                      busy || p!.unmappedWageTypes!.some((item) => !wageMappings[item.code])
                    }
                    onClick={() => void saveMappings()}
                  >
                    Zuordnen und neu auswerten
                  </Button>
                </section>
              )}
              <Field label="Gehaltsbuchung (±5 Tage)">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={match}
                    disabled={busy}
                    onChange={(e) => setBookingId(e.target.value)}
                  >
                    <option value="">
                      {payoutAccount?.type === 'cash'
                        ? 'Neue Auszahlung bestätigen'
                        : 'Neue Auszahlung vormerken'}
                    </option>
                    {data.matches.map((m) => (
                      <option value={m.id} key={m.id}>
                        {longDay(m.date)} · {eur(m.amountCents)} · Differenz{' '}
                        {eur(m.differenceCents)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {selectedMatch && (
                <p>
                  Buchung: {eur(selectedMatch.amountCents)} · Differenz zur Auszahlung:{' '}
                  {eur(selectedMatch.differenceCents)}
                </p>
              )}
              {!data.matches.length && (
                <p>
                  Keine Gehaltsbuchung im Zeitfenster gefunden. Nach der Bestätigung wird die
                  Auszahlung auf dem gewählten Konto gebucht.
                </p>
              )}
              <p>
                {selectedMatch
                  ? 'Die vorhandene Buchung wird verknüpft. Ihre Zuordnung bleibt erhalten.'
                  : payoutAccount?.type === 'cash'
                    ? 'Die neue Bargeldauszahlung wird sofort bestätigt.'
                    : 'Die neue Auszahlung wird vorgemerkt. Gehalt und steuerfreie Erstattungen werden getrennt zugeordnet.'}
              </p>
            </>
          )}
          <div className="sources-actions">
            <a className="btn btn-ghost" href={`/api/receipts/${data.receiptId}/download`}>
              Original-PDF herunterladen
            </a>
            {data.status === 'confirmed' && data.payout && (
              <a className="btn btn-ghost"
                href={`/konten/buchungen?konto=${encodeURIComponent(data.payout.accountId)}&buchung=${encodeURIComponent(data.payout.bookingId)}`}>
                Gespeicherte Auszahlung öffnen
              </a>
            )}
            <Button
              disabled={busy || !canConfirm || data.status !== 'pending'}
              onClick={() => void act('confirm')}
            >
              Bestätigen
            </Button>
            <Button
              variant="ghost"
              disabled={busy || data.status !== 'pending'}
              onClick={() => void act('reject')}
            >
              Ablehnen
            </Button>
            <Button
              variant="ghost"
              disabled={busy || data.status !== 'pending'}
              onClick={() => void act('retry')}
            >
              Erneut auswerten
            </Button>
          </div>
        </>
      )}
    </>
  );
  if (inline)
    return (
      <section className="payslip-intake-review" aria-label="Gehaltszettelprüfung">
        {duplicate && (
          <p role="status">Duplikat erkannt. Die bestehende Abrechnung wird angezeigt.</p>
        )}
        {!duplicate && <p role="status">{data?.status === 'confirmed' ? 'Gehaltszettel gespeichert.' : 'PDF gespeichert. Offene Angaben bitte prüfen.'}</p>}
        {review}
      </section>
    );
  return (
    <>
      <Button variant="ghost" onClick={() => setDialogOpen(true)}>
        Gehaltszettel prüfen
      </Button>
      <WideDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Gehaltszettel prüfen"
        beforeClose={() => !busy}
      >
        <div className="payslip-review-dialog">{review}</div>
      </WideDialog>
    </>
  );
}
type SourceStatus = {
  accounts: Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'>[];
  passwordSet: boolean;
  passwordSource: 'app' | 'server' | null;
  passwordRememberAvailable: boolean;
  dropboxConnected: boolean;
  dropboxConfigured: boolean;
  dropboxWrite: boolean;
  lastScanAt: string | null;
  filesFound: number;
  errors: number;
  config: PayslipSourceConfig;
  payees?: { id: string; name: string }[];
};
export function PayslipSourceSection() {
  const query = useQuery({
    queryKey: ['payslip-source'],
    queryFn: () => request<SourceStatus>('GET', PATH + '/status'),
  });
  return (
    <section className="data-source-section" aria-labelledby="payslip-source-title">
      <SectionHead id="payslip-source-title" title="Gehaltszettel" />
      {query.isFetching && <LoadingNote what="Gehaltszettel-Datenquelle" />}
      {query.isError && (
        <ErrorNote
          what="Gehaltszettel-Datenquelle"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && !query.isFetching && (
        <>
          <dl className="source-status">
            <div>
              <dt>PDF-Passwort hinterlegt</dt>
              <dd>
                {query.data.passwordSource === 'app'
                  ? 'ja (in der App)'
                  : query.data.passwordSource === 'server'
                    ? 'ja (Server)'
                    : 'nein'}
                <small> · Server-Geheimnis PAYSLIP_PDF_PASSWORD</small>
              </dd>
            </div>
            <div>
              <dt>Uploads werden in Dropbox abgelegt</dt>
              <dd>{query.data.dropboxWrite ? 'ja' : 'nein'}</dd>
            </div>
            <div>
              <dt>Dropbox verbunden</dt>
              <dd>
                {query.data.dropboxConnected ? 'ja' : 'nein'}
                {query.data.dropboxConfigured && !query.data.dropboxConnected
                  ? ' · wartet auf erfolgreichen Scan'
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Letzter Scan</dt>
              <dd>
                {query.data.lastScanAt
                  ? new Date(query.data.lastScanAt).toLocaleString('de-AT')
                  : 'Noch nicht'}
              </dd>
            </div>
            <div>
              <dt>Dateien gefunden</dt>
              <dd>{query.data.filesFound}</dd>
            </div>
            <div>
              <dt>Fehler / Warnungen</dt>
              <dd>{query.data.errors}</dd>
            </div>
          </dl>
          <PayslipPasswordControls
            source={query.data.passwordSource}
            available={query.data.passwordRememberAvailable}
          />
          <PayslipSourceForm initial={query.data.config} accounts={query.data.accounts} payees={query.data.payees ?? []} />
        </>
      )}
      <p>Dropbox wird nachts gelesen. PDFs erscheinen zur Bestätigung unter Prüfen.</p>
    </section>
  );
}
function PayslipPasswordControls({
  source,
  available,
}: {
  source: 'app' | 'server' | null;
  available: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    qc = useQueryClient(),
    toast = useToast();
  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setPassword('');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['payslip-source'] });
      toast.show({ message: done });
    } catch (e) {
      toast.show({ message: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="payslip-password-controls">
      {!available && (
        <p>Passwort merken ist deaktiviert: Am Server ist BUDGET_PEPPER nicht gesetzt.</p>
      )}
      {editing ? (
        <div className="sources-actions">
          <Field label="Neues PDF-Passwort">
            {({ id }) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="off"
                maxLength={256}
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button
            disabled={busy || !password}
            onClick={() =>
              void run(
                () => request('PUT', PATH + '/password', { password }),
                'Passwort gespeichert. Es wird beim nächsten Upload geprüft.',
              )
            }
          >
            Speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <div className="sources-actions">
          <Button variant="ghost" disabled={!available} onClick={() => setEditing(true)}>
            Passwort ändern
          </Button>
          {source === 'app' && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(() => request('DELETE', PATH + '/password'), 'Passwort vergessen.')
              }
            >
              Vergessen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
const WAGE_LABELS = {
  earning: 'Bezug (in Brutto enthalten)',
  deduction: 'Sonstiger Abzug',
  reimbursement: 'Steuerfreie Erstattung',
  tax_adjustment: 'Lohnsteuer-Aufrollung',
  sv_adjustment: 'SV-Aufrollung',
} as const;
function PayslipSourceForm({
  initial,
  accounts,
  payees,
}: {
  initial: PayslipSourceConfig;
  accounts: SourceStatus['accounts'];
  payees: { id: string; name: string }[];
}) {
  const [salaryAccountId, setAccount] = useState(initial.salaryAccountId ?? '');
  const [automaticPayeeId, setAutomaticPayee] = useState(initial.automation?.payeeId ?? '');
  const [rows, setRows] = useState(() =>
    Object.entries(initial.wageTypes).map(([code, type]) => ({ code, type })),
  );
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite(),
    toast = useToast();
  const save = async () => {
    if (busy) return;
    if (
      rows.some((r) => !/^\d{1,8}$/.test(r.code)) ||
      new Set(rows.map((r) => r.code)).size !== rows.length
    ) {
      toast.show({
        message: 'Jede Lohnart muss eine eindeutige Nummer mit höchstens 8 Stellen sein.',
      });
      return;
    }
    setBusy(true);
    await write(
      () =>
        request<{ groupId: string }>('PUT', PATH + '/config', {
          salaryAccountId: salaryAccountId || null,
          ...(automaticPayeeId ? { automation: { payeeId: automaticPayeeId } } : {}),
          wageTypes: Object.fromEntries(rows.map((r) => [r.code, r.type])),
        }),
      () => 'Gehaltsquelle gespeichert.',
    );
    setBusy(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Gehaltskonto">
        {({ id }) => (
          <Select
            id={id}
            value={salaryAccountId}
            disabled={busy}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Kein Konto gewählt</option>
            <AccountOptions accounts={accounts} keepId={salaryAccountId} />
          </Select>
        )}
      </Field>
      <Field label="Arbeitgeber / Absender für automatische Gehaltszettel">
        {({ id }) => (
          <Select id={id} value={automaticPayeeId} disabled={busy}
            onChange={(event) => setAutomaticPayee(event.target.value)}>
            <option value="">Automatische Speicherung aus</option>
            {payees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select>
        )}
      </Field>
      <p>Einmal dem Gehaltskonto und einem vorhandenen Absender zuordnen. Nur eindeutig validierte
        neue Uploads werden automatisch gespeichert; bestehende Buchungen bleiben unverändert.</p>
      <p>
        Lohnarten aus dem Dokument zuordnen. Bezüge sind bereits in der Bruttosumme enthalten.
        Aufrollungen behalten ihr Vorzeichen.
      </p>
      {rows.map((row, i) => (
        <div className="sources-actions" key={i}>
          <Field label={`Lohnart ${i + 1}`}>
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={row.code}
                maxLength={8}
                disabled={busy}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, code: e.target.value } : r)))
                }
              />
            )}
          </Field>
          <Field label={`Typ ${i + 1}`}>
            {({ id }) => (
              <Select
                id={id}
                value={row.type}
                disabled={busy}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      j === i ? { ...r, type: e.target.value as typeof row.type } : r,
                    ),
                  )
                }
              >
                {Object.entries(WAGE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Lohnart {i + 1} entfernen
          </Button>
        </div>
      ))}
      <div className="sources-actions">
        <Button
          variant="ghost"
          disabled={busy || rows.length >= 200}
          onClick={() => setRows([...rows, { code: '', type: 'reimbursement' }])}
        >
          Lohnart hinzufügen
        </Button>
        <Button type="submit" disabled={busy}>
          Zuordnung speichern
        </Button>
      </div>
      <p>Nach Änderungen das PDF unter Prüfen erneut auswerten.</p>
    </form>
  );
}
