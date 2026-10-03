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
};
const draftFor = (security?: SecurityRecord): Draft => ({
  name: security?.name ?? '',
  kind: security?.kind ?? 'etf',
  currency: security?.currency ?? 'EUR',
  isin: security?.isin ?? '',
  symbol: security?.symbol ?? '',
  assetClassId: security?.assetClassId ?? '',
});
type Errors = Partial<Record<keyof Draft | 'form', string>>;

/** Basic metadata only: existing source settings, costs and account ownership stay authoritative. */
export function InstrumentForm({
  security,
  onDirty,
  onSaved,
  onSelect,
  onBusy,
}: {
  security?: SecurityRecord | undefined;
  onDirty: (dirty: boolean) => void;
  onSaved: (security: SecurityRecord) => void;
  onSelect: (id?: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  useAmountPrivacy();
  const [original] = useState(() => draftFor(security));
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
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const values = {
        name,
        kind: draft.kind,
        currency,
        isin,
        symbol: draft.symbol.trim() || null,
        assetClassId: draft.assetClassId || null,
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
