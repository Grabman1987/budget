import {
  Button,
  Field,
  SectionHead,
  Select,
  TextInput,
  cx,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { cents, formatDecimal, parseAmount, parseScaledDecimal } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { useReorder } from '../ledger/account-order';
import { errorText } from '../ledger/labels';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { ANLAGEKLASSEN_META } from '../nav/pages';
import {
  assetClassListQuery,
  assignSecurityClass,
  createAssetClass,
  orderAssetClasses,
  renameAssetClass,
  saveTargetTiers,
  securityListQuery,
  targetTiersQuery,
  type AssetClassListing,
  type TargetTierView,
  type TierDraftInput,
} from '../wealth/asset-settings-api';
import { TargetSetNote } from '../wealth/target-set';
import { PageFrame } from './placeholder-page';
import '../ledger/account-order.css';
import './accounts-settings.css';

/** Einstellungen › Anlageklassen: classes, their securities and the target sets by investment sum. */
export function AssetClassesSettingsPage() {
  useAmountPrivacy();
  return (
    <PageFrame meta={ANLAGEKLASSEN_META} revealCurrentRegister>
      <AssetClassesSettings />
    </PageFrame>
  );
}

export function AssetClassesSettings() {
  useAmountPrivacy();
  const classes = useQuery(assetClassListQuery());
  return (
    <div className="asset-settings">
      {classes.isPending && <LoadingNote what="Anlageklassen" />}
      {classes.isError && (
        <ErrorNote
          what="Anlageklassen"
          error={classes.error}
          onRetry={() => void classes.refetch()}
        />
      )}
      {classes.data && (
        <>
          <ClassList classes={classes.data.assetClasses} />
          <SecurityAssignment classes={classes.data.assetClasses} />
          <TierEditor classes={classes.data.assetClasses} />
        </>
      )}
    </div>
  );
}

// ---------- Anlageklassen: create, rename, order ----------

function ClassList({ classes }: { classes: AssetClassListing[] }) {
  const write = useBudgetWrite();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const reorder = useReorder(
    classes.map((c) => c.id),
    (ids) =>
      void write(
        () => orderAssetClasses(ids),
        () => 'Reihenfolge der Anlageklassen gespeichert.',
      ),
    (id) => names.get(id) ?? '',
  );
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const result = await write(
        () => createAssetClass(name),
        () => `Anlageklasse „${name}“ angelegt.`,
      );
      if (result) setNewName('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="asset-block" aria-labelledby="asset-classes-title">
      <SectionHead id="asset-classes-title" title="Anlageklassen" />
      <p>
        Jede Anlageklasse fasst Wertpapiere zusammen, zum Beispiel Aktien Welt oder Anleihen. Die
        Reihenfolge gilt für Portfolio, Allocation-Report und diese Seite.
      </p>
      {reorder.status}
      {classes.length === 0 ? (
        <p className="vnote" role="status">
          Noch keine Anlageklassen angelegt.
        </p>
      ) : (
        <ul className="accounts-list">
          {classes.map((c) => {
            const row = reorder.rowProps(c.id);
            return (
              <li {...row} className={cx(row.className, 'asset-class-row')} key={c.id}>
                <ClassName cls={c} />
                {reorder.controls(c.id)}
              </li>
            );
          })}
        </ul>
      )}
      <form className="kform" onSubmit={(e) => void create(e)}>
        <Field label="Neue Anlageklasse">
          {({ id }) => (
            <TextInput
              id={id}
              value={newName}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
        </Field>
        <div className="panel-actions">
          <Button type="submit" variant="ghost" disabled={busy || newName.trim() === ''}>
            Anlageklasse anlegen
          </Button>
        </div>
      </form>
    </section>
  );
}

function ClassName({ cls }: { cls: AssetClassListing }) {
  const write = useBudgetWrite();
  const [name, setName] = useState(cls.name);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== cls.name && name.trim() !== '';
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setBusy(true);
    try {
      await write(
        () => renameAssetClass(cls.id, name.trim()),
        () => `Anlageklasse in „${name.trim()}“ umbenannt.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="kform" onSubmit={(e) => void save(e)}>
      <span className="accounts-actions">
        <TextInput
          aria-label={`Name der Anlageklasse ${cls.name}`}
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="ghost" size="sm" disabled={!changed || busy}>
          Umbenennen
        </Button>
      </span>
    </form>
  );
}

// ---------- Wertpapiere den Klassen zuordnen ----------

function SecurityAssignment({ classes }: { classes: AssetClassListing[] }) {
  const write = useBudgetWrite();
  const query = useQuery(securityListQuery());
  const [busyId, setBusyId] = useState<string>();
  return (
    <section className="asset-block" aria-labelledby="asset-assign-title">
      <SectionHead id="asset-assign-title" title="Wertpapiere zuordnen" />
      <p>Jedes Wertpapier gehört zu genau einer Anlageklasse oder zu keiner.</p>
      {query.isPending && <LoadingNote what="Wertpapiere" />}
      {query.isError && (
        <ErrorNote what="Wertpapiere" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && query.data.securities.length === 0 && (
        <p className="vnote" role="status">
          Noch keine Wertpapiere erfasst.
        </p>
      )}
      {query.data && query.data.securities.length > 0 && (
        <ul className="accounts-list">
          {query.data.securities.map((s) => (
            <li className="asset-class-row" key={s.id}>
              <span className="accounts-name">
                <strong>{s.name}</strong>
                <small>{s.isin ?? s.symbol ?? ''}</small>
              </span>
              <Select
                aria-label={`Anlageklasse von ${s.name}`}
                value={s.assetClassId ?? ''}
                disabled={busyId === s.id}
                onChange={(e) => {
                  const next = e.target.value || null;
                  setBusyId(s.id);
                  void write(
                    () => assignSecurityClass(s.id, next),
                    () =>
                      next
                        ? `${s.name} der Anlageklasse „${classes.find((c) => c.id === next)?.name ?? ''}“ zugeordnet.`
                        : `${s.name} ohne Anlageklasse.`,
                  ).finally(() => setBusyId(undefined));
                }}
              >
                <option value="">Ohne Anlageklasse</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Zielsets nach Anlagesumme ----------

interface TierDraft {
  key: string;
  /** Threshold as typed (amount, arithmetic allowed); empty = the open tier "darüber". */
  upTo: string;
  shares: Record<string, string>;
  bands: Record<string, string>;
}

const bpText = (bp: number) => (bp / 100).toFixed(2).replace('.', ',');
const readBp = (value: string): number | null => {
  const raw = value.trim().replace(',', '.');
  if (raw === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const bp = parseScaledDecimal(raw, 2);
  return bp >= 0 && bp <= 10_000 ? bp : null;
};

function draftOf(tier: TargetTierView, classes: AssetClassListing[], key: string): TierDraft {
  const by = new Map(tier.shares.map((s) => [s.assetClassId, s]));
  return {
    key,
    upTo: tier.upToCents === null ? '' : formatDecimal(cents(tier.upToCents)),
    shares: Object.fromEntries(
      classes.map((c) => [c.id, by.has(c.id) ? bpText(by.get(c.id)!.targetShareBp) : '']),
    ),
    bands: Object.fromEntries(
      classes.map((c) => [c.id, by.get(c.id)?.bandBp ? bpText(by.get(c.id)!.bandBp) : '']),
    ),
  };
}

function TierEditor({ classes }: { classes: AssetClassListing[] }) {
  useAmountPrivacy();
  const query = useQuery(targetTiersQuery());
  return (
    <section className="asset-block" aria-labelledby="asset-tiers-title">
      <SectionHead id="asset-tiers-title" title="Zielgewichte nach Anlagesumme" />
      <p>
        Je höher die Anlagesumme, desto anders kann die Aufteilung ausfallen. Jedes Zielset gilt bis
        zu einer Anlagesumme (zum Beispiel bis 10.000 €, bis 20.000 €, bis 50.000 €, darüber) und
        legt für jede Anlageklasse den Soll-Anteil fest, auf Wunsch mit eigenem Band. Das passende
        Set wählt die aktuelle Anlagesumme.
      </p>
      <p className="text-muted">
        Anlagesumme = Marktwert aller Investment-Konten (Depots, Krypto, P2P, sonstige Investments)
        plus ihre Verrechnungskonten, soweit diese keine Budget-Konten sind, jeweils mit dem Saldo,
        also auch ein negativer Kontostand. Portfolio, Allocation-Report und Regel R13 verwenden das
        aktive Zielset. Ohne Zielsets gelten die datierten Sollquoten aus Vermögen › Portfolio.
      </p>
      {query.isPending && <LoadingNote what="Zielsets" />}
      {query.isError && (
        <ErrorNote what="Zielsets" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <>
          {query.data.tiers.length > 0 ? (
            <TargetSetNote set={query.data.active} />
          ) : (
            <p className="vnote" role="status">
              Es sind keine Zielsets angelegt; die datierten Sollquoten gelten.
            </p>
          )}
          <TierForm
            key={JSON.stringify(query.data.tiers)}
            classes={classes}
            saved={query.data.tiers}
            activeId={query.data.active.source === 'tiers' ? activeTierKey(query.data) : null}
          />
        </>
      )}
    </section>
  );
}

/** The saved tier the investment sum selects (by position among the saved tiers). */
function activeTierKey(data: { tiers: TargetTierView[]; active: { position: number | null } }) {
  const position = data.active.position;
  return position === null ? null : (data.tiers[position - 1]?.id ?? null);
}

function TierForm({
  classes,
  saved,
  activeId,
}: {
  classes: AssetClassListing[];
  saved: TargetTierView[];
  activeId: string | null;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const initial = useMemo(
    () => saved.map((t) => draftOf(t, classes, t.id)),
    // The form is re-keyed by the saved tiers, so computing once per mount is right.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [tiers, setTiers] = useState<TierDraft[]>(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState(0);
  const dirty = JSON.stringify(tiers) !== JSON.stringify(initial);

  const update = (key: string, patch: Partial<TierDraft>) => {
    setTiers((all) => all.map((t) => (t.key === key ? { ...t, ...patch } : t)));
    setError(undefined);
  };
  const addTier = () => {
    const key = `new-${counter}`;
    setCounter(counter + 1);
    // The last tier stays the open one: a new tier goes before it.
    const fresh: TierDraft = {
      key,
      upTo: '',
      shares: Object.fromEntries(classes.map((c) => [c.id, ''])),
      bands: Object.fromEntries(classes.map((c) => [c.id, ''])),
    };
    setTiers((all) => [...all, fresh]);
    setError(undefined);
  };
  const removeTier = (key: string) => {
    setTiers((all) => all.filter((t) => t.key !== key));
    setError(undefined);
  };
  const sums = tiers.map((t) => {
    const values = classes.map((c) => readBp(t.shares[c.id] ?? ''));
    return values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (classes.length === 0) {
      setError('Lege zuerst Anlageklassen an.');
      return;
    }
    const input: TierDraftInput[] = [];
    const seen = new Set<number | null>();
    for (const [i, t] of tiers.entries()) {
      const label = `Zielset ${i + 1}`;
      let upToCents: number | null = null;
      if (t.upTo.trim() !== '') {
        const parsed = parseAmount(t.upTo);
        if (!parsed.ok || parsed.cents < 0) {
          setError(
            `${label}: Bitte eine Anlagesumme ab 0 € eintragen oder leer lassen für „darüber“.`,
          );
          return;
        }
        upToCents = parsed.cents;
      }
      if (seen.has(upToCents)) {
        setError(
          upToCents === null
            ? 'Nur ein Zielset kann „darüber“ gelten.'
            : `${label}: Diese Anlagesumme gibt es schon.`,
        );
        return;
      }
      seen.add(upToCents);
      const targets: TierDraftInput['targets'] = [];
      let sum = 0;
      for (const c of classes) {
        const share = readBp(t.shares[c.id] ?? '');
        const band = readBp(t.bands[c.id] ?? '');
        if (share === null || band === null) {
          setError(`${label}: Prozentwerte prüfen (zum Beispiel 60,00).`);
          return;
        }
        sum += share;
        if (share > 0 || (t.shares[c.id] ?? '').trim() !== '')
          targets.push({
            assetClassId: c.id,
            targetShareBp: share,
            ...(band > 0 ? { bandBp: band } : {}),
          });
      }
      if (sum !== 10_000) {
        setError(`${label}: Die Sollanteile müssen zusammen genau 100,00 % ergeben.`);
        return;
      }
      input.push({ upToCents, targets });
    }
    setBusy(true);
    setError(undefined);
    try {
      await write(
        () => saveTargetTiers(input),
        () =>
          input.length === 0
            ? 'Zielsets entfernt, die datierten Sollquoten gelten wieder.'
            : 'Zielsets gespeichert.',
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="kform" onSubmit={(e) => void submit(e)} noValidate>
      {tiers.length === 0 && (
        <p className="vnote" role="status">
          Noch kein Zielset. Mit „Zielset hinzufügen“ legst du das erste an.
        </p>
      )}
      {tiers.map((t, i) => {
        const sum = sums[i] ?? null;
        const open = t.upTo.trim() === '';
        return (
          <fieldset
            className="tier-set"
            key={t.key}
            disabled={busy}
            aria-label={`Zielset ${i + 1}`}
          >
            <div className="tier-head">
              <strong>{open ? 'Zielset darüber' : `Zielset bis ${t.upTo.trim()} €`}</strong>
              {activeId === t.key && <span className="tier-active-mark">aktiv</span>}
              <Button variant="ghost" size="sm" onClick={() => removeTier(t.key)}>
                Zielset entfernen
              </Button>
            </div>
            <div className="tier-threshold">
              <Field
                label={`Gilt bis Anlagesumme (€), Zielset ${i + 1}`}
                hint="Leer lassen: gilt darüber, für jede höhere Anlagesumme."
              >
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    inputMode="decimal"
                    value={t.upTo}
                    placeholder="10.000"
                    onChange={(e) => update(t.key, { upTo: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <div className="tier-grid">
              {classes.map((c) => (
                <div key={c.id}>
                  <Field label={`${c.name} · Soll (%), Zielset ${i + 1}`}>
                    {({ id }) => (
                      <TextInput
                        id={id}
                        inputMode="decimal"
                        maxLength={6}
                        value={t.shares[c.id] ?? ''}
                        placeholder="0,00"
                        onChange={(e) =>
                          update(t.key, { shares: { ...t.shares, [c.id]: e.target.value } })
                        }
                      />
                    )}
                  </Field>
                  <Field label={`${c.name} · Band ± (Prozentpunkte), Zielset ${i + 1}`}>
                    {({ id }) => (
                      <TextInput
                        id={id}
                        inputMode="decimal"
                        maxLength={6}
                        value={t.bands[c.id] ?? ''}
                        placeholder="Standard"
                        onChange={(e) =>
                          update(t.key, { bands: { ...t.bands, [c.id]: e.target.value } })
                        }
                      />
                    )}
                  </Field>
                </div>
              ))}
            </div>
            <p className={cx('tier-sum', sum !== 10_000 && 'is-off')} aria-live="polite">
              Summe: {sum === null ? 'Angaben prüfen' : `${bpText(sum)} %`} · erforderlich 100,00 %
            </p>
          </fieldset>
        );
      })}
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
      <div className="panel-actions">
        <Button variant="ghost" onClick={addTier} disabled={busy}>
          Zielset hinzufügen
        </Button>
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Speichert …' : 'Zielsets speichern'}
        </Button>
      </div>
    </form>
  );
}
