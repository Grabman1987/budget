import { parseScaledDecimal, todayInVienna } from '@budget/domain';
import {
  Button,
  Field,
  Select,
  TextInput,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, request } from '../api/http';
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
  name: string;
  kind: SecurityRecord['kind'];
  currency: string;
  isin: string;
  symbol: string;
  assetClassId: string;
  exposureValidFrom: string;
  ter: string;
  leverage: string;
};
const draftFor = (security?: SecurityRecord, effectiveDay = todayInVienna()): Draft => ({
  name: security?.name ?? '',
  kind: security?.kind ?? 'etf',
  currency: security?.currency ?? 'EUR',
  isin: security?.isin ?? '',
  symbol: security?.symbol ?? '',
  assetClassId: security?.assetClassId ?? '',
  exposureValidFrom: effectiveDay,
  ter: String((security?.terBp ?? 0) / 100).replace('.', ','),
  leverage: String((security?.leverageFactor ?? 10) / 10).replace('.', ','),
});
type Errors = Partial<Record<keyof Draft | 'form', string>>;

/** Basic metadata only: existing source settings, costs and account ownership stay authoritative. */
export function InstrumentForm({
  security,
  onDirty,
  onSaved,
  onSelect,
  onBusy,
  effectiveDay,
}: {
  security?: SecurityRecord | undefined;
  onDirty: (dirty: boolean) => void;
  onSaved: (security: SecurityRecord) => void;
  onSelect: (id?: string) => void;
  onBusy: (busy: boolean) => void;
  effectiveDay?: string | undefined;
}) {
  useAmountPrivacy();
  const [original] = useState(() => draftFor(security, effectiveDay));
  const [draft, setDraft] = useState(original);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const classes = useQuery(assetClassesQuery());
  const qc = useQueryClient();
  const toast = useToast();
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
        name,
        terBp,
        leverageFactor,
        kind: draft.kind,
        currency,
        isin,
        symbol: draft.symbol.trim() || null,
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
      await qc.invalidateQueries();
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
              {classes.data?.assetClasses.map((group) => (
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
