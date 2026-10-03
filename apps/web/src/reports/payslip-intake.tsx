import {
  payrollTotals,
  type ParsedPayrollDocument,
  type PayslipSourceConfig,
} from '@budget/domain';
import { Button, Field, SectionHead, Select, TextInput, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import './payslip-intake.css';

const PATH = '/api/payslip-intake';
export function PayslipUpload() {
  const picker = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const qc = useQueryClient();
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(PATH + '/upload', {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as {
        duplicate: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new ApiError(response.status, result.error ?? 'unknown', result.message);
      setMessage(
        result.duplicate
          ? 'Dieses PDF wurde bereits aufgenommen.'
          : 'PDF im Posteingang zur Bestätigung bereit.',
      );
      await qc.invalidateQueries();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="payslip-upload">
      <input
        ref={picker}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Gehaltszettel-PDF auswählen"
        disabled={busy}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" disabled={busy} onClick={() => picker.current?.click()}>
        Gehaltszettel hochladen
      </Button>
      <span>PDF · höchstens 15 MB{busy ? ' · Wird ausgewertet …' : ''}</span>
      {message && (
        <p role="status">
          {message} <AppLink to="/konten/posteingang">Posteingang öffnen</AppLink>
        </p>
      )}
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
  status: string;
  parsed: ParsedPayrollDocument;
  matches: {
    id: string;
    date: string;
    amountCents: number;
    differenceCents: number;
    exact: boolean;
  }[];
};
export function PayslipIntakeDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['payslip-intake', id],
    queryFn: () => request<Intake>('GET', `${PATH}/${id}`),
  });
  const [bookingId, setBookingId] = useState<string | undefined>(),
    [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const data = query.isSuccess && !query.isFetching ? query.data : undefined;
  const match =
    bookingId ??
    (data?.matches.filter((m) => m.exact).length === 1
      ? data.matches.find((m) => m.exact)!.id
      : '');
  const p = data?.parsed,
    totals = p?.draft ? payrollTotals([p.draft]) : null;
  const selectedMatch = data?.matches.find((m) => m.id === match);
  const canConfirm = Boolean(
    p?.draft &&
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
          action === 'retry' ? {} : { action, bookingId: match || null },
        ),
      () =>
        action === 'confirm'
          ? 'Gehaltszettel gespeichert.'
          : action === 'reject'
            ? 'Gehaltszettel verworfen.'
            : 'PDF erneut ausgewertet.',
    );
    setBusy(false);
  }
  return (
    <details className="payslip-intake-detail">
      <summary>Gehaltszettel prüfen</summary>
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
              <Field label="Gehaltsbuchung (±5 Tage)">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={match}
                    disabled={busy}
                    onChange={(e) => setBookingId(e.target.value)}
                  >
                    <option value="">Ohne Buchungsverknüpfung speichern</option>
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
                  Keine Gehaltsbuchung im Zeitfenster gefunden. Gehaltskonto unter Datenquellen
                  prüfen.
                </p>
              )}
              <p>
                Steuerfreie Erstattungen sind hier vom Gehalt getrennt. In der Gehaltsbuchung
                Erstattungen ebenfalls separat zuordnen, damit sie nicht in die Sparquote eingehen.
                Es wird keine Buchung erstellt.
              </p>
            </>
          )}
          <a className="btn btn-ghost" href={`/api/receipts/${data.receiptId}/download`}>
            Original-PDF herunterladen
          </a>
          <div className="sources-actions">
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
    </details>
  );
}
type SourceStatus = {
  accounts: { id: string; name: string }[];
  passwordSet: boolean;
  dropboxConnected: boolean;
  dropboxConfigured: boolean;
  lastScanAt: string | null;
  filesFound: number;
  errors: number;
  config: PayslipSourceConfig;
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
              <dt>Passwort gesetzt</dt>
              <dd>{query.data.passwordSet ? 'ja' : 'nein'}</dd>
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
          <PayslipSourceForm initial={query.data.config} accounts={query.data.accounts} />
        </>
      )}
      <p>Dropbox wird nachts gelesen. PDFs erscheinen zur Bestätigung im Posteingang.</p>
    </section>
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
}: {
  initial: PayslipSourceConfig;
  accounts: SourceStatus['accounts'];
}) {
  const [salaryAccountId, setAccount] = useState(initial.salaryAccountId ?? '');
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
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
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
      <p>Nach Änderungen das PDF im Posteingang erneut auswerten.</p>
    </form>
  );
}
