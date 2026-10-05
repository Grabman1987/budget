import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@budget/ui';
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

export function InflationBasketSettingsPage() {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'inflation-basket-settings'],
    retry: false,
    queryFn: () => request<{ categories: Row[] }>('GET', PATH),
  });
  const write = useBudgetWrite();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async (changes: Change[]) => {
    setBusy(true);
    const result = await write(
      () => request<{ groupId: string }>('PUT', PATH, { changes }),
      () => 'Warenkorb gespeichert.',
    );
    if (result) setSelected([]);
    setBusy(false);
  };
  const rows = query.data?.categories ?? [];
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
          Automatisch zählen Bedarf-Fixkosten und regelmäßige periodische Kosten mit. Wunsch und
          Zukunft brauchen „Immer“. Variable Kategorien: „Immer“ und „VPI-Teilindex“ wählen.
          Verträge messen Preise; das 12-Monats-Mittel enthält auch Verbrauch und Nachzahlungen.
          Schuldzinsen über die Empfänger-Auswahl ausschließen; Namen werden nicht automatisch
          bewertet.
        </p>
        <div className="basket-actions">
          <span role="status">{selected.length} ausgewählt</span>
          <Button
            disabled={busy || !selected.length}
            onClick={() =>
              void save(selected.map((categoryId) => ({ categoryId, inclusion: 'always' })))
            }
          >
            In den Warenkorb
          </Button>
        </div>
        {query.isPending && <LoadingNote what="Warenkorb" />}
        {query.isError && (
          <ErrorNote what="Warenkorb" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isSuccess && !rows.length && (
          <p className="sr-note">Noch keine Ausgabenkategorien angelegt.</p>
        )}
        {[...new Set(rows.map((c) => c.groupId))].map((group) => (
          <fieldset className="basket-group" key={group} disabled={busy}>
            <legend>{rows.find((c) => c.groupId === group)!.groupName}</legend>
            {rows
              .filter((c) => c.groupId === group)
              .map((c) => (
                <div className="basket-category" key={c.id} data-testid={'basket-category-' + c.id}>
                  <div className="basket-category-top">
                    <label className="basket-selection">
                      <input
                        type="checkbox"
                        aria-label={'Auswählen: ' + c.name}
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <strong>{c.name}</strong>
                    </label>
                    <label>
                      Im Warenkorb
                      <select
                        aria-label={'Im Warenkorb: ' + c.name}
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
                    <BasketMethod
                      key={JSON.stringify([c.method, c.trailingMean, c.coicop])}
                      row={c}
                      save={save}
                    />
                  </div>
                  <p className="sr-note">
                    {c.included ? 'Im Warenkorb' : 'Nicht im Warenkorb'} · {c.reason}
                  </p>
                  {c.inclusion !== null && (
                    <p className="sr-note">Automatisch: {c.automaticReason}</p>
                  )}
                  <details>
                    <summary>Empfänger und Verträge · {c.payees.length}</summary>
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
  onSelect,
}: {
  label: string;
  code: string;
  onSelect: (code: string) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <Combobox
      label={label}
      value={typing ?? coicopLabel(code ? [{ code, shareBp: 10000 }] : [])}
      filter={typing ?? ''}
      options={[
        { id: '', label: 'Keine Klasse' },
        ...COICOP_CLASSES.map((c) => ({ id: c.code, label: `${c.code} ${c.name}` })),
      ]}
      listWhenEmpty
      pickFirst
      placeholder="Code oder Name suchen"
      emptyText="Keine Klasse gefunden."
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
  const [method, setMethod] = useState(
    row.method ??
      (row.trailingMean === null ? 'automatic' : row.trailingMean ? 'trailing' : 'contracts'),
  );
  const [first, setFirst] = useState(row.coicop[0]?.code ?? '');
  const [second, setSecond] = useState(row.coicop[1]?.code ?? '');
  const [share, setShare] = useState(String((row.coicop[0]?.shareBp ?? 8000) / 100));
  const bp = Math.round(Number(share) * 100);
  const valid =
    (!first && !second && method !== 'cpi') ||
    (!!first && first !== second && (!second || (Number.isFinite(bp) && bp > 0 && bp < 10000)));
  return (
    <>
      <label>
        Methode
        <select
          aria-label={'Methode: ' + row.name}
          value={method}
          onChange={(e) => {
            const value = e.target.value;
            setMethod(value);
            if (value !== 'cpi')
              void save([
                {
                  categoryId: row.id,
                  method: null,
                  trailingMean: value === 'automatic' ? null : value === 'trailing',
                },
              ]);
          }}
        >
          <option value="automatic">Automatisch</option>
          <option value="contracts">Verträge</option>
          <option value="trailing">12-Monats-Mittel</option>
          <option value="cpi">VPI-Teilindex</option>
        </select>
      </label>
      {
        <div className="basket-coicop">
          <p className="sr-note">
            VPI-Vergleich im Kategorie-Explorer: Zuordnung unabhängig von der Warenkorb-Methode.
            Ohne Klasse: Gesamt-VPI (kein Teilindex).
            {method === 'cpi' &&
              ' Im Warenkorb kommt der Preis von Statistik Austria, das Gewicht aus deinen Ausgaben im Basisjahr.'}
          </p>
          <div className="basket-coicop-fields">
            <CoicopSelect
              label="COICOP-Klasse 1"
              code={first}
              onSelect={(code) => {
                setFirst(code);
              }}
            />
            <CoicopSelect
              label="COICOP-Klasse 2"
              code={second}
              onSelect={(code) => {
                setSecond(code);
              }}
            />
            {second && (
              <label>
                Anteil Klasse 1 (%)
                <input
                  type="number"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  value={share}
                  onChange={(e) => {
                    setShare(e.target.value);
                  }}
                />
                <small>
                  Klasse 2: {new Intl.NumberFormat('de-AT').format(100 - Number(share))} %
                </small>
              </label>
            )}
          </div>
          <Button
            disabled={!valid}
            onClick={() => {
              void save([
                {
                  categoryId: row.id,
                  method: method === 'cpi' ? 'cpi' : null,
                  coicop: [
                    ...(first ? [{ code: first, shareBp: second ? bp : 10000 }] : []),
                    ...(second ? [{ code: second, shareBp: 10000 - bp }] : []),
                  ],
                },
              ]);
            }}
          >
            Zuordnung speichern
          </Button>
          <span role="status">
            {(method === 'cpi' ? row.method === 'cpi' : row.method === null) &&
            first === (row.coicop[0]?.code ?? '') &&
            second === (row.coicop[1]?.code ?? '') &&
            (!second || bp === row.coicop[0]?.shareBp)
              ? 'Zuordnung gespeichert'
              : 'Zuordnung noch nicht gespeichert'}
          </span>
          {!valid && (
            <p className="sr-note">
              Bitte eine Klasse wählen; zwei verschiedene Klassen mit Anteilen zusammen 100 %.
            </p>
          )}
        </div>
      }
    </>
  );
}
