import { parseRegionWeights, parseScaledDecimal, todayInVienna } from '@budget/domain';
import {
  Button,
  Field,
  Select,
  TextInput,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, request } from '../api/http';
import {
  ArivaLinkField,
  ARIVA_LINK_ERROR,
  validArivaLink,
  quoteFailureText,
  latestQuoteFailure,
} from './quote-source';
import type { QuoteDiagnostics, QuotePreview } from '../inbox/quote-cause';
import { LEDGER_KEY } from '../ledger/queries';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { assetClassesQuery, instrumentQuery, type SecurityRecord } from './portfolio-api';

export const INSTRUMENT_KIND: Record<SecurityRecord['kind'], string> = {
  etf: 'ETF',
  stock: 'Aktie',
  fund: 'Fonds',
  bond: 'Anleihe',
  crypto: 'Krypto',
  p2p: 'P2P',
  commodity: 'Rohstoff',
  other: 'Sonstiges',
};
type Draft = {
  regionsJson: string;
  name: string;
  kind: SecurityRecord['kind'];
  currency: string;
  isin: string;
  symbol: string;
  quoteUrl: string;
  assetClassId: string;
  exposureValidFrom: string;
  ter: string;
  leverage: string;
};
const draftFor = (security?: SecurityRecord, effectiveDay = todayInVienna()): Draft => ({
  regionsJson: security?.regionsJson ?? '',
  name: security?.name ?? '',
  kind: security?.kind ?? 'etf',
  currency: security?.currency ?? 'EUR',
  isin: security?.isin ?? '',
  symbol: security?.symbol ?? '',
  quoteUrl: security?.quoteUrl ?? '',
  assetClassId: security?.assetClassId ?? '',
  exposureValidFrom: effectiveDay,
  ter: String((security?.terBp ?? 0) / 100).replace('.', ','),
  leverage: String((security?.leverageFactor ?? 10) / 10).replace('.', ','),
});
type RegionRow = { name: string; pct: string };
/** Simple "Region · %" rows over the stored JSON format (fractions, e.g. {"Region":0.6}). */
const regionRowsOf = (json: string): RegionRow[] => {
  const weights = json.trim() ? parseRegionWeights(json) : null;
  return Object.entries(weights ?? {}).map(([name, share]) => ({
    name,
    pct: String(Math.round(share * 10000) / 100).replace('.', ','),
  }));
};
const regionRowsJson = (rows: RegionRow[]): string => {
  const filled = rows.filter((r) => r.name.trim() || r.pct.trim());
  if (!filled.length) return '';
  const out: Record<string, number> = {};
  for (const r of filled) {
    const pct = r.pct.trim().replace(',', '.');
    const name = r.name.trim();
    if (!name || !/^\d+(\.\d{1,2})?$/.test(pct) || name in out) return 'invalid';
    out[name] = Math.round(Number(pct) * 100) / 10000;
  }
  return JSON.stringify(out);
};
type Errors = Partial<Record<keyof Draft | 'form', string>>;

/** Metadata and the explicit quote link use the existing audited security update. */
export function InstrumentForm({
  security,
  onDirty,
  onSaved,
  onSelect,
  onBusy,
  effectiveDay,
  initialKind,
}: {
  security?: SecurityRecord | undefined;
  onDirty: (dirty: boolean) => void;
  onSaved: (security: SecurityRecord) => void;
  onSelect: (id?: string) => void;
  onBusy: (busy: boolean) => void;
  effectiveDay?: string | undefined;
  initialKind?: SecurityRecord['kind'] | undefined;
}) {
  useAmountPrivacy();
  const [original] = useState(() => ({
    ...draftFor(security, effectiveDay),
    ...(!security && initialKind ? { kind: initialKind } : {}),
  }));
  const [draft, setDraft] = useState(original);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const classes = useQuery(assetClassesQuery());
  const diagnostics = useQuery({
    queryKey: [...LEDGER_KEY, 'quote-diagnostics', security?.id],
    enabled: !!security,
    queryFn: () =>
      request<QuoteDiagnostics>(
        'GET',
        `/api/securities/${encodeURIComponent(security!.id)}/quote-diagnostics`,
      ),
  });
  const preview = useMutation({
    mutationFn: () =>
      request<QuotePreview>(
        'POST',
        `/api/securities/${encodeURIComponent(security!.id)}/quote-preview`,
        {},
      ),
  });
  const latestFailure = latestQuoteFailure(diagnostics.data?.attempts);
  const qc = useQueryClient();
  const toast = useToast();
  const [regionRows, setRows] = useState<RegionRow[]>(() => regionRowsOf(original.regionsJson));
  const setRegionRows = (index: number, row: RegionRow | null) => {
    const next = regionRows.slice();
    if (row) next[index] = row;
    else next.splice(index, 1);
    setRows(next);
    update('regionsJson', regionRowsJson(next));
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(original);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const remaining = { ...errors };
    delete remaining[key];
    delete remaining.form;
    setErrors(remaining);
    onDirty(JSON.stringify(next) !== JSON.stringify(original));
  };
  const reverse = (groupId: string, id: string, redo = false) =>
    void undoGroup(groupId).then(
      async (result) => {
        if (!security && !redo) onSelect();
        await qc.invalidateQueries();
        if (!security && redo) onSelect(id);
        toast.show({
          message: redo ? 'Wiederholt.' : 'Rückgängig gemacht.',
          actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
          onAction: () => reverse(result.groupId, id, !redo),
        });
      },
      (error: unknown) =>
        toast.show({
          message: `${redo ? 'Wiederholen' : 'Rückgängig'} nicht möglich. ${errorText(error)}`,
        }),
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || (!changed && security)) return;
    const name = draft.name.trim();
    const currency = draft.currency.trim().toUpperCase();
    const isin = draft.isin.trim().toUpperCase() || null;
    const invalid: Errors = {};
    if (
      draft.quoteUrl !== original.quoteUrl &&
      draft.quoteUrl.trim() &&
      !validArivaLink(draft.quoteUrl)
    )
      invalid.quoteUrl = ARIVA_LINK_ERROR;
    if (draft.regionsJson.trim() && !parseRegionWeights(draft.regionsJson))
      invalid.regionsJson =
        'Länderanteile prüfen: Region und Anteil in % eingeben, Summe höchstens 100 %.';
    if (!name || name.length > 120) invalid.name = 'Name mit 1 bis 120 Zeichen eingeben.';
    if (!/^[A-Z]{3}$/.test(currency))
      invalid.currency = 'Dreistelligen Währungscode eingeben, etwa EUR.';
    if (isin && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin))
      invalid.isin = 'ISIN mit zwölf Zeichen eingeben.';
    const terBp = /^\d+(?:[,.]\d{1,2})?$/.test(draft.ter)
      ? parseScaledDecimal(draft.ter.replace(',', '.'), 2)
      : null;
    const leverageFactor = /^\d+(?:[,.]\d)?$/.test(draft.leverage)
      ? parseScaledDecimal(draft.leverage.replace(',', '.'), 1)
      : null;
    if (terBp === null || terBp < 0 || terBp > 10000)
      invalid.ter = 'TER zwischen 0 und 100 % eingeben, höchstens zwei Nachkommastellen.';
    if (leverageFactor === null || leverageFactor < 10 || leverageFactor > 1000)
      invalid.leverage = 'Faktor zwischen 1 und 100 eingeben, höchstens eine Nachkommastelle.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const values = {
        regionsJson: draft.regionsJson.trim() || null,
        name,
        terBp,
        leverageFactor,
        kind: draft.kind,
        currency,
        isin,
        symbol: draft.symbol.trim() || null,
        ...(draft.quoteUrl !== original.quoteUrl
          ? { quoteUrl: draft.quoteUrl.trim() || null }
          : {}),
        ...(!security ||
        draft.assetClassId !== original.assetClassId ||
        draft.exposureValidFrom !== original.exposureValidFrom
          ? { assetClassId: draft.assetClassId || null, exposureValidFrom: draft.exposureValidFrom }
          : {}),
      };
      const result = await request<{ security: SecurityRecord; groupId: string }>(
        security ? 'PATCH' : 'POST',
        security ? `/api/securities/${encodeURIComponent(security.id)}` : '/api/securities',
        values,
      );
      qc.setQueryData(instrumentQuery(result.security.id).queryKey, { security: result.security });
      void qc.invalidateQueries(); // #1201: close on the write, refetch in the background
      onDirty(false);
      onSaved(result.security);
      toast.show({
        message: security ? 'Stammdaten gespeichert.' : 'Instrument angelegt.',
        actionLabel: 'Rückgängig',
        onAction: () => reverse(result.groupId, result.security.id),
      });
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiError && error.status === 409
            ? 'Diese ISIN gehört bereits zu einem anderen Instrument.'
            : error instanceof ApiError && error.status === 400
              ? 'Stammdaten konnten nicht gespeichert werden. Bitte Angaben prüfen.'
              : errorText(error),
      });
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <form className="kform instrument-form" onSubmit={(event) => void save(event)}>
      <fieldset className="instrument-fields" disabled={busy}>
        <Field label="Name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={draft.name}
              maxLength={120}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('name', event.target.value)}
            />
          )}
        </Field>
        <Field label="Art">
          {({ id }) => (
            <Select
              id={id}
              value={draft.kind}
              onChange={(event) => update('kind', event.target.value as Draft['kind'])}
            >
              {Object.entries(INSTRUMENT_KIND).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Währung" error={errors.currency}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={draft.currency}
              maxLength={3}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('currency', event.target.value)}
            />
          )}
        </Field>
        <Field label="ISIN" error={errors.isin} hint="Optional, zwölf Zeichen.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={draft.isin}
              maxLength={12}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('isin', event.target.value)}
            />
          )}
        </Field>
        <Field label="Symbol" hint="Optionales Börsen- oder Kryptosymbol.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              value={draft.symbol}
              maxLength={40}
              aria-describedby={describedBy}
              onChange={(event) => update('symbol', event.target.value)}
            />
          )}
        </Field>
        {security && latestFailure && (
          <p className="vnote">{quoteFailureText(latestFailure, security.currency)}</p>
        )}
        {draft.kind !== 'crypto' && !draft.quoteUrl && (
          <p className="vnote">Kein Kurs-Link hinterlegt</p>
        )}
        {security && (
          <div>
            <Button
              type="button"
              variant="ghost"
              disabled={preview.isPending || changed}
              onClick={() => preview.mutate()}
            >
              Quelle testen (Vorschau)
            </Button>
            {changed && <p className="vnote">Änderungen vor dem Quellentest speichern.</p>}
            {preview.isError && (
              <ErrorNote
                what="Quellvorschau"
                error={preview.error}
                onRetry={() => preview.reset()}
              />
            )}
            {preview.data && (
              <div role="status">
                <p>Vorschau: Keine Kurse gespeichert.</p>
                {preview.data.attempts.map((attempt, index) => (
                  <p key={index}>
                    {attempt.source}:{' '}
                    {attempt.latest
                      ? 'Die Quelle liefert Kurse'
                      : quoteFailureText(
                          attempt.error ?? 'unbekannt',
                          security.currency,
                          attempt.currencyEvidence?.origin === 'response'
                            ? attempt.currencyEvidence.currency
                            : undefined,
                        )}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {draft.kind !== 'crypto' && (
          <ArivaLinkField
            value={draft.quoteUrl}
            onChange={(value) => update('quoteUrl', value)}
            error={errors.quoteUrl}
          />
        )}
        <Field label="TER (%)" error={errors.ter} hint="Bei ETF und Fonds bedeutet 0: unbekannt.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={draft.ter}
              inputMode="decimal"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => update('ter', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Hebelfaktor"
          error={errors.leverage}
          hint="1 = ohne Hebel; etwa 2 für einen zweifachen Hebel."
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={draft.leverage}
              inputMode="decimal"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => update('leverage', e.target.value)}
            />
          )}
        </Field>
        {classes.isPending && <LoadingNote what="Anlageklassen" />}
        {classes.isError && (
          <ErrorNote
            what="Anlageklassen"
            error={classes.error}
            onRetry={() => void classes.refetch()}
          />
        )}
        <Field label="Anlageklasse">
          {({ id }) => (
            <Select
              id={id}
              value={draft.assetClassId}
              disabled={!classes.isSuccess}
              onChange={(event) => update('assetClassId', event.target.value)}
            >
              <option value="">Ohne Anlageklasse</option>
              {classes.data?.assetClasses
                .filter((group) => !group.isGroup)
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field
          label="Klassenzuordnung gültig ab"
          hint="Die gewählte Klasse gilt ab diesem Tag mit 100 %. Frühere Versionen bleiben erhalten."
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="date"
              value={draft.exposureValidFrom}
              required
              onChange={(event) => update('exposureValidFrom', event.target.value)}
            />
          )}
        </Field>
        <details className="settings-advanced instrument-advanced" open={!!errors.regionsJson}>
          <summary>Erweitert</summary>
          <fieldset className="instrument-regions">
            <legend>Länderanteile</legend>
            <p className="vnote">Region und Anteil in %. Leer bedeutet keine Angabe.</p>
            {regionRows.map((row, index) => (
              <div className="instrument-region-row" key={index}>
                <TextInput
                  aria-label={`Region ${index + 1}`}
                  value={row.name}
                  maxLength={60}
                  onChange={(e) => setRegionRows(index, { name: e.target.value })}
                />
                <TextInput
                  aria-label={`Anteil ${index + 1} (%)`}
                  value={row.pct}
                  inputMode="decimal"
                  onChange={(e) => setRegionRows(index, { pct: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Region ${index + 1} entfernen`}
                  onClick={() => setRegionRows(index, null)}
                >
                  Entfernen
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRegionRows(regionRows.length, { name: '', pct: '' })}
            >
              Region hinzufügen
            </Button>
            {errors.regionsJson && (
              <p role="alert" className="field-error">
                {errors.regionsJson}
              </p>
            )}
          </fieldset>
        </details>
        {errors.form && (
          <p role="alert" className="field-error">
            {maskMoneyText(errors.form)}
          </p>
        )}
        <Button type="submit" disabled={busy || !classes.isSuccess || (!!security && !changed)}>
          {busy ? 'Wird gespeichert …' : security ? 'Stammdaten speichern' : 'Instrument anlegen'}
        </Button>
      </fieldset>
    </form>
  );
}
