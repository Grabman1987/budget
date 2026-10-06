import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InflationReport } from '@budget/db';
import type { z } from 'zod';
import { COICOP_CLASSES, coicopLabel, type inflationBasketChanges } from '@budget/domain';
import { Combobox } from '../ledger/combobox';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from './placeholder-page';
import '../reports/spending-reports.css';
import './inflation-basket-settings.css';

type Row = InflationReport['basketSettings'][number];
type Change = z.infer<typeof inflationBasketChanges>['changes'][number];
const PATH = '/api/inflation-basket';
const RHYTHMS = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  semiannual: 'Halbjährlich',
  yearly: 'Jährlich',
};

function basketExplanation(row: Row) {
  const reason = row.reason || row.automaticReason;
  if (row.inclusion === 'never') return 'Ausgeschlossen';
  if (reason === 'Wunsch und Zukunft nur mit „Immer“')
    return 'Zählt nicht automatisch mit: Wunsch oder Zukunft – wähle „Immer“, wenn diese Ausgabe dazugehören soll.';
  if (reason === 'Variable Kategorie: Menge und Preis nicht trennbar')
    return 'Zählt nicht mit: wechselnde Menge, Preis nicht getrennt erkennbar – wähle „Immer“ und eine Preisgruppe der offiziellen Statistik (VPI-Teilindex).';
  if (reason === 'Keine VPI-Teilindexwerte oder Ausgaben nach Empfänger-Auswahl')
    return 'Zählt noch nicht mit: Für die gewählte Preisgruppe fehlen Statistikwerte oder passende Ausgaben.';
  if (
    reason === 'Kein regelmäßiger Preis mit ausreichender Buchungshistorie nach Empfänger-Auswahl'
  )
    return 'Zählt noch nicht mit: Nach den Ausnahmen fehlen regelmäßige Preise oder genügend Buchungen.';
  if (row.included && row.method === 'cpi')
    return 'Zählt mit: Der Preis kommt aus der offiziellen Statistik, das Gewicht aus deinen Ausgaben.';
  if (row.included && row.trailingMean === true)
    return 'Zählt mit: Der Preis wird aus dem Durchschnitt deiner Buchungen über zwölf Monate ermittelt; darin steckt auch dein Verbrauch.';
  if (row.included && row.inclusion === 'always')
    return 'Zählt mit, weil du „Immer“ gewählt hast. Der Preis kommt aus deinen Buchungen.';
  if (row.included) return 'Zählt automatisch mit, weil Bedarf mit festem oder regelmäßigem Preis.';
  return 'Zählt derzeit nicht mit: Es fehlen passende Preise oder Ausgaben.';
}

export function InflationBasketSettingsPage() {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'inflation-basket-settings'],
    retry: false,
    queryFn: () => request<{ categories: Row[] }>('GET', PATH),
  });
  const write = useBudgetWrite();
  const [pending, setPending] = useState<Change[]>([]);
  const save = async (changes: Change[]) => {
    setPending(changes);
    await write(
      () => request<{ groupId: string }>('PUT', PATH, { changes }),
      () => 'Warenkorb gespeichert.',
    );
    setPending([]);
  };
  const rows = (query.data?.categories ?? []).map((c) => {
    const change = pending.find((change) => change.categoryId === c.id);
    if (!change) return c;
    return {
      ...c,
      inclusion: change.inclusion === undefined ? c.inclusion : change.inclusion,
      method: change.method === undefined ? c.method : change.method,
      coicop: change.coicop ?? c.coicop,
      excludedPayeeIds: change.excludedPayeeIds ?? c.excludedPayeeIds,
      payees: c.payees.map((p) => ({
        ...p,
        included: !(change.excludedPayeeIds ?? c.excludedPayeeIds).includes(p.id),
      })),
    };
  });
  const included = rows.filter((c) => c.included);
  const manual = included.filter(
    (c) => c.inclusion === 'always' || c.method === 'cpi' || c.trailingMean !== null,
  ).length;
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/warenkorb')!}
      title="Warenkorb (Teuerung)"
    >
      <section className="sr-card basket-settings" aria-labelledby="basket-settings-title">
        <div className="sr-head">
          <h2 id="basket-settings-title">Kategorien im Warenkorb</h2>
          <AppLink to="/reports/inflation">Zur persönlichen Inflation</AppLink>
        </div>
        <p className="sr-note">
          Dein Warenkorb enthält die alltäglichen Ausgaben, deren Preisentwicklung Report 2.4 mit
          dem offiziellen Verbraucherpreisindex (VPI) vergleicht. Die meisten Kategorien wählt die
          App automatisch: Bedarf mit festen oder regelmäßig wiederkehrenden Preisen. Für die
          übrigen entscheidest du, was mitzählt.
        </p>
        {query.isSuccess && (
          <p role="status" className="basket-summary">
            Im Warenkorb: {included.length} Kategorien · Automatisch: {included.length - manual} ·
            Von dir gesetzt: {manual} · Ausgeschlossen: {rows.length - included.length}
          </p>
        )}
        <p className="sr-note">
          Änderungen werden automatisch gespeichert. Im Hinweis „Warenkorb gespeichert.“ kannst du
          sie rückgängig machen.
        </p>
        {query.isPending && <LoadingNote what="Warenkorb" />}
        {query.isError && (
          <ErrorNote what="Warenkorb" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isSuccess && !rows.length && (
          <p className="sr-note">Noch keine Ausgabenkategorien angelegt.</p>
        )}
        {[...new Set(rows.map((c) => c.groupId))].map((group) => (
          <fieldset className="basket-group" key={group} disabled={pending.length > 0}>
            <legend>{rows.find((c) => c.groupId === group)!.groupName}</legend>
            {rows
              .filter((c) => c.groupId === group)
              .map((c) => (
                <div className="basket-category" key={c.id} data-testid={'basket-category-' + c.id}>
                  <div className="basket-category-top">
                    <strong>{c.name}</strong>
                    <label>
                      Zählt mit
                      <select
                        aria-label={'Zählt mit: ' + c.name}
                        aria-describedby={'basket-effect-' + c.id}
                        value={c.inclusion ?? 'automatic'}
                        onChange={(e) =>
                          void save([
                            {
                              categoryId: c.id,
                              inclusion:
                                e.target.value === 'automatic'
                                  ? null
                                  : (e.target.value as 'always' | 'never'),
                            },
                          ])
                        }
                      >
                        <option value="automatic">Automatisch</option>
                        <option value="always">Immer</option>
                        <option value="never">Nie</option>
                      </select>
                    </label>
                  </div>
                  <p className="sr-note" id={'basket-effect-' + c.id}>
                    {basketExplanation(c)}
                  </p>
                  <BasketMethod key={JSON.stringify([c.method, c.coicop])} row={c} save={save} />
                  <details>
                    <summary>
                      <span>Ausnahmen ({c.payees.length})</span>
                      <small>Abwählen, was nicht als Preis zählen soll (z. B. Zinsen).</small>
                    </summary>
                    {c.payees.length === 0 ? (
                      <p className="sr-note">Noch keine passenden Buchungen oder Verträge.</p>
                    ) : (
                      c.payees.map((p) => (
                        <label className="basket-payee" key={p.id ?? 'none'}>
                          <input
                            type="checkbox"
                            checked={p.included}
                            aria-label={p.name + ' zählt mit'}
                            onChange={(e) =>
                              void save([
                                {
                                  categoryId: c.id,
                                  excludedPayeeIds: e.target.checked
                                    ? c.excludedPayeeIds.filter((id) => id !== p.id)
                                    : [...c.excludedPayeeIds, p.id],
                                },
                              ])
                            }
                          />
                          <span>
                            {p.name} · zählt mit
                            {p.contracts.length > 0 && <small>{p.contracts.join(', ')}</small>}
                            {p.rhythm && (
                              <small>
                                {RHYTHMS[p.rhythm]}
                                {!p.contracts.length ? ' · aus Buchungen abgeleitet' : ''}
                              </small>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </details>
                </div>
              ))}
          </fieldset>
        ))}
      </section>
    </PageFrame>
  );
}

function CoicopSelect({
  label,
  code,
  otherCode,
  onSelect,
}: {
  label: string;
  code: string;
  otherCode: string;
  onSelect: (code: string) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <Combobox
      label={label}
      value={typing ?? coicopLabel(code ? [{ code, shareBp: 10000 }] : [])}
      filter={typing ?? ''}
      options={[
        { id: '', label: 'Keine Preisgruppe' },
        ...COICOP_CLASSES.filter((c) => c.code !== otherCode).map((c) => ({
          id: c.code,
          label: `${c.code} ${c.name}`,
        })),
      ]}
      listWhenEmpty
      pickFirst
      placeholder="Code oder Name suchen"
      emptyText="Keine Preisgruppe gefunden."
      onChange={setTyping}
      onFocusChange={(focused) => !focused && setTyping(null)}
      onSelect={(option) => {
        onSelect(option.id);
        setTyping(null);
      }}
    />
  );
}

function BasketMethod({ row, save }: { row: Row; save: (changes: Change[]) => Promise<void> }) {
  const first = row.coicop[0]?.code ?? '';
  const second = row.coicop[1]?.code ?? '';
  const [share, setShare] = useState(String((row.coicop[0]?.shareBp ?? 5000) / 100));
  const bp = Math.round(Number(share) * 100);
  const valid = Number.isFinite(bp) && bp > 0 && bp < 10000;
  const saveClasses = (codes: string[], firstShare = 5000) => {
    void save([
      {
        categoryId: row.id,
        method: codes.length ? 'cpi' : null,
        coicop: codes.map((code, index) => ({
          code,
          shareBp: codes.length === 1 ? 10000 : index === 0 ? firstShare : 10000 - firstShare,
        })),
      },
    ]);
  };
  return (
    <details className="basket-coicop" open={row.coicop.length > 0}>
      <summary>Preis aus der offiziellen Statistik</summary>
      <p className="sr-note">
        Für Kategorien mit wechselnder Menge, z. B. Lebensmittel oder Treibstoff, nimmt die App den
        Preis von Statistik Austria statt deiner Buchungen. Wähle dafür eine Preisgruppe
        (VPI-Teilindex); ohne Preisgruppe verwendet die App wieder deine Buchungen.
      </p>
      <div className="basket-coicop-fields">
        <CoicopSelect
          label="Preisgruppe 1"
          code={first}
          otherCode={second}
          onSelect={(code) => {
            if (code !== first || (code && row.method !== 'cpi'))
              saveClasses([code, second].filter(Boolean), row.coicop[0]?.shareBp);
          }}
        />
        {first && (
          <CoicopSelect
            label="Preisgruppe 2 (optional)"
            code={second}
            otherCode={first}
            onSelect={(code) => {
              if (code !== second || (code && row.method !== 'cpi'))
                saveClasses([first, code].filter(Boolean), second ? row.coicop[0]?.shareBp : 5000);
            }}
          />
        )}
        {second && (
          <label>
            Anteil Preisgruppe 1 (%)
            <input
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              value={share}
              aria-label="Anteil Preisgruppe 1 (%)"
              aria-invalid={!valid}
              onChange={(e) => setShare(e.target.value)}
              onBlur={(e) => {
                if (valid && e.currentTarget.validity.valid && bp !== row.coicop[0]?.shareBp)
                  saveClasses([first, second], bp);
              }}
            />
            <small>
              Preisgruppe 2: {new Intl.NumberFormat('de-AT').format(100 - Number(share))} %
            </small>
            {!valid && (
              <small role="alert">Bitte einen Anteil zwischen 0,01 und 99,99 % eingeben.</small>
            )}
          </label>
        )}
      </div>
    </details>
  );
}
