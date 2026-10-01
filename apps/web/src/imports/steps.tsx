import { Button, SectionHead, Select, Switch, TextInput } from '@budget/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { KIND_LABEL } from '../budget/labels';
import { eur, longDay } from '../ledger/format';
import { monthLabel } from '../nav/month';
import {
  ACCOUNT_TYPES,
  DROP,
  previewMapping,
  type AccountType,
  type Mapping,
  type MappingAccount,
  type MappingRule,
  type Overview,
  type RuleEffect,
  type TargetClass,
  type TargetKind,
  type YearSums,
} from './api';

/** The wizard's editing steps: each gets the draft mapping and changes a copy of it. */
export interface StepProps {
  runId: string;
  overview: Overview;
  draft: Mapping;
  setDraft: (next: Mapping) => void;
}

export const TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Giro',
  cash: 'Bargeld',
  savings: 'Tagesgeld',
  credit_card: 'Kreditkarte',
  loan: 'Kredit',
  brokerage: 'Depot',
  crypto: 'Krypto',
  p2p: 'P2P',
  receivable: 'Forderung',
  other_asset: 'Sonstiges Vermögen',
  other_liability: 'Sonstige Verbindlichkeit',
};
const CLASS_TEXT: Record<TargetClass, string> = {
  need: 'Bedarf',
  want: 'Wunsch',
  future: 'Zukunft',
};
const KINDS = Object.keys(KIND_LABEL).filter((k) => k !== 'card_payment') as TargetKind[];

const clone = (m: Mapping): Mapping => structuredClone(m);

/** `2024: −1.234 € · 2025: …` for the counts-and-sums column. */
export function YearList({ years }: { years: YearSums }) {
  const entries = Object.entries(years).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="text-muted">–</span>;
  return (
    <span className="imp-years">
      {entries.map(([year, cents]) => (
        <span key={year}>
          <span className="tech">{year}</span> {eur(cents, { cents: false })}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------

export function AccountsStep({ overview, draft, setDraft }: StepProps) {
  const [kept] = useState(() => new Map<string, MappingAccount>());
  const change = (name: string, patch: Partial<MappingAccount> | 'skip' | 'keep') => {
    const next = clone(draft);
    const current = next.accounts[name];
    if (patch === 'skip') {
      if (current && current !== 'skip') kept.set(name, current);
      next.accounts[name] = 'skip';
    } else if (patch === 'keep') {
      const raw = overview.accounts.find((a) => a.name === name);
      next.accounts[name] = kept.get(name) ?? {
        id: `acc-${name}`,
        name,
        type: raw?.proposal.type ?? 'checking',
        onBudget: raw?.proposal.onBudget ?? true,
        closedAt: raw?.proposal.closedAt ?? null,
      };
    } else if (current && current !== 'skip') next.accounts[name] = { ...current, ...patch };
    setDraft(next);
  };
  return (
    <section aria-labelledby="imp-acc">
      <SectionHead id="imp-acc" title="Konten" aside={`${overview.accounts.length} in YNAB`} />
      <p className="imp-lead">
        Art, Budget-Zugehörigkeit und Schließdatum je Konto. Die Vorschläge kommen aus den
        Buchungen; nur Konten, die vor dem Start geschlossen wurden, dürfen wegfallen.
      </p>
      <table className="ktable imp-table">
        <caption className="sr-only">YNAB-Konten und ihre Zielkonten</caption>
        <thead>
          <tr>
            <th className="tech" scope="col">
              YNAB-Konto
            </th>
            <th className="tech" scope="col">
              Name
            </th>
            <th className="tech" scope="col">
              Art
            </th>
            <th className="tech" scope="col">
              Budget
            </th>
            <th className="tech" scope="col">
              Übernehmen
            </th>
          </tr>
        </thead>
        <tbody>
          {overview.accounts.map((a) => {
            const m = draft.accounts[a.name];
            const on = m !== undefined && m !== 'skip';
            return (
              <tr key={a.name}>
                <td>
                  <span className="kname-s">{a.name}</span>
                  <span className="kmeta">
                    {a.rows} Zeilen · {eur(a.balanceCents)}
                    {a.proposal.closedAt ? ` · zuletzt ${longDay(a.proposal.closedAt)}` : ''}
                  </span>
                </td>
                <td data-label="Name">
                  {on && (
                    <TextInput
                      aria-label={`Name für ${a.name}`}
                      value={m.name}
                      onChange={(e) => change(a.name, { name: e.target.value })}
                    />
                  )}
                </td>
                <td data-label="Art">
                  {on && (
                    <Select
                      aria-label={`Art von ${a.name}`}
                      value={m.type}
                      onChange={(e) => change(a.name, { type: e.target.value as AccountType })}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td data-label="Budget">
                  {on && (
                    <Switch
                      label={`${a.name} im Budget`}
                      checked={m.onBudget}
                      onChange={(onBudget) => change(a.name, { onBudget })}
                    />
                  )}
                </td>
                <td data-label="Übernehmen">
                  <Switch
                    label={`${a.name} übernehmen`}
                    checked={on}
                    onChange={(keep) => change(a.name, keep ? 'keep' : 'skip')}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

/** Target structure next to YNAB: sources are assigned with a select (keyboard), not by drag. */
export function CategoriesStep({ overview, draft, setDraft }: StepProps) {
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const stats = useMemo(() => new Map(overview.categories.map((c) => [c.key, c])), [overview]);
  const targets = Object.entries(draft.targets);
  const groups = [...new Set(targets.map(([, t]) => t.group))];
  const sourcesOf = (id: string) =>
    Object.entries(draft.categories)
      .filter(([, t]) => t === id)
      .map(([key]) => key);
  const totals = (id: string) => {
    const years: YearSums = {};
    let count = 0;
    for (const key of sourcesOf(id)) {
      const s = stats.get(key);
      count += s?.count ?? 0;
      for (const [y, c] of Object.entries(s?.years ?? {})) years[y] = (years[y] ?? 0) + c;
    }
    return { count, years };
  };
  const edit = (fn: (m: Mapping) => void) => {
    const next = clone(draft);
    fn(next);
    setDraft(next);
  };
  const merge = (from: string, into: string) =>
    edit((m) => {
      for (const [key, t] of Object.entries(m.categories)) if (t === from) m.categories[key] = into;
      delete m.targets[from];
    });
  const add = () => {
    if (!newName.trim() || !newGroup.trim()) return;
    edit((m) => {
      m.targets[`neu-${Date.now()}`] = {
        name: newName.trim(),
        group: newGroup.trim(),
        kind: 'variable',
        class: 'need',
        hidden: false,
        cardAccount: null,
      };
    });
    setNewName('');
  };
  const options = (
    <>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {targets
            .filter(([, t]) => t.group === g)
            .map(([id, t]) => (
              <option key={id} value={id}>
                {t.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="imp-side">
      <section aria-labelledby="imp-target">
        <SectionHead id="imp-target" title="Zielstruktur" aside={`${targets.length} Kategorien`} />
        <table className="ktable imp-table imp-targets">
          <caption className="sr-only">Zielkategorien mit Buchungen und Jahressummen</caption>
          <thead>
            <tr>
              <th className="tech" scope="col">
                Kategorie
              </th>
              <th className="tech" scope="col">
                Art und Klasse
              </th>
              <th className="tech kc-num" scope="col">
                Buchungen
              </th>
              <th className="tech" scope="col">
                Zusammenführen
              </th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr className="kgroup">
                <th scope="colgroup" colSpan={4} className="imp-group">
                  {g}
                </th>
              </tr>
              {targets
                .filter(([, t]) => t.group === g)
                .map(([id, t]) => {
                  const total = totals(id);
                  const card = t.kind === 'card_payment';
                  return (
                    <tr key={id}>
                      <td>
                        <TextInput
                          aria-label={`Name der Zielkategorie ${t.name}`}
                          value={t.name}
                          onChange={(e) => edit((m) => void (m.targets[id]!.name = e.target.value))}
                        />
                        <span className="kmeta">
                          <YearList years={total.years} />
                        </span>
                      </td>
                      <td data-label="Art und Klasse">
                        {card ? (
                          <span>{KIND_LABEL.card_payment}</span>
                        ) : (
                          <span className="imp-pair">
                            <Select
                              aria-label={`Art von ${t.name}`}
                              value={t.kind}
                              onChange={(e) =>
                                edit(
                                  (m) => void (m.targets[id]!.kind = e.target.value as TargetKind),
                                )
                              }
                            >
                              {KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {KIND_LABEL[k]}
                                </option>
                              ))}
                            </Select>
                            <Select
                              aria-label={`Klasse von ${t.name}`}
                              value={t.class ?? ''}
                              onChange={(e) =>
                                edit(
                                  (m) =>
                                    void (m.targets[id]!.class = (e.target.value ||
                                      null) as TargetClass | null),
                                )
                              }
                            >
                              <option value="">Bedarf (Vorschlag)</option>
                              {(Object.keys(CLASS_TEXT) as TargetClass[]).map((c) => (
                                <option key={c} value={c}>
                                  {CLASS_TEXT[c]}
                                </option>
                              ))}
                            </Select>
                          </span>
                        )}
                      </td>
                      <td className="kc-num" data-label="Buchungen">
                        {total.count}
                      </td>
                      <td data-label="Zusammenführen">
                        {!card && (
                          <Select
                            aria-label={`${t.name} zusammenführen mit`}
                            value=""
                            onChange={(e) => e.target.value && merge(id, e.target.value)}
                          >
                            <option value="">–</option>
                            {options}
                          </Select>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
        <div className="imp-add">
          <TextInput
            aria-label="Name der neuen Zielkategorie"
            placeholder="Neue Kategorie"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <TextInput
            aria-label="Gruppe der neuen Zielkategorie"
            placeholder="Gruppe"
            list="imp-groups"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <datalist id="imp-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <Button variant="ghost" size="sm" onClick={add}>
            Anlegen
          </Button>
        </div>
      </section>

      <section aria-labelledby="imp-ynab">
        <SectionHead
          id="imp-ynab"
          title="YNAB"
          aside={`${overview.categories.length} Kategorien`}
        />
        <table className="ktable imp-table imp-sources">
          <caption className="sr-only">YNAB-Kategorien und ihr Ziel</caption>
          <thead>
            <tr>
              <th className="tech" scope="col">
                YNAB-Kategorie
              </th>
              <th className="tech kc-num" scope="col">
                Buchungen
              </th>
              <th className="tech" scope="col">
                Ziel
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.categories.map((c) => (
              <tr key={c.key}>
                <td>
                  <span className="kname-s">{c.name}</span>
                  <span className="kmeta">
                    {c.group}
                    {c.hidden ? ' · ausgeblendet' : ''} · <YearList years={c.years} />
                  </span>
                </td>
                <td className="kc-num" data-label="Buchungen">
                  {c.count}
                </td>
                <td data-label="Ziel">
                  <Select
                    aria-label={`Ziel für ${c.group}: ${c.name}`}
                    value={draft.categories[c.key] ?? ''}
                    onChange={(e) => edit((m) => void (m.categories[c.key] = e.target.value))}
                  >
                    {!draft.categories[c.key] && <option value="">– wählen –</option>}
                    {options}
                    <option value={DROP}>Verwerfen (Rest nach Zu verteilen)</option>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function RulesStep({ runId, overview, draft, setDraft }: StepProps) {
  const [rule, setRule] = useState({ payee: '', memo: '', category: '', target: '', from: '' });
  const [effects, setEffects] = useState<RuleEffect[] | null>(null);
  const [busy, setBusy] = useState(false);
  const months = overview.months.filter((m) => m >= draft.startMonth);
  const targetName = (id: string | null | undefined) =>
    id === null ? 'Zu verteilen' : id ? (draft.targets[id]?.name ?? id) : '–';
  const edit = (fn: (m: Mapping) => void) => {
    const next = clone(draft);
    fn(next);
    setDraft(next);
    setEffects(null);
  };
  const add = () => {
    const match: MappingRule['match'] = {};
    if (rule.payee) match.payee = rule.payee;
    if (rule.memo) match.memo = rule.memo;
    if (rule.category) match.category = rule.category;
    if (Object.keys(match).length === 0 || rule.target === '') return;
    edit((m) => {
      m.rules.push({
        id: `r${Date.now()}`,
        ...(rule.from ? { from: rule.from } : {}),
        match,
        set: { category: rule.target === 'tbb' ? null : rule.target },
      });
      m.rulesFrom ??= draft.startMonth;
    });
    setRule({ payee: '', memo: '', category: '', target: '', from: '' });
  };
  const preview = async () => {
    setBusy(true);
    try {
      setEffects((await previewMapping(runId, draft)).rules);
    } finally {
      setBusy(false);
    }
  };
  const field = (label: string, input: ReactNode) => (
    <label className="imp-field">
      <span className="tech">{label}</span>
      {input}
    </label>
  );
  return (
    <section aria-labelledby="imp-rules">
      <SectionHead id="imp-rules" title="Umkategorisieren" aside={`${draft.rules.length} Regeln`} />
      <p className="imp-lead">
        Regeln verteilen Buchungen ab einem Monat auf andere Zielkategorien. Vorher bleibt alles wie
        in YNAB, danach zeigt der Abgleich die verschobenen Beträge.
      </p>
      <label className="imp-field">
        <span className="tech">Regeln gelten ab</span>
        <Select
          aria-label="Regeln gelten ab"
          value={draft.rulesFrom ?? ''}
          onChange={(e) => edit((m) => void (m.rulesFrom = e.target.value || null))}
        >
          <option value="">–</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
      </label>
      {draft.rules.length > 0 && (
        <ul className="sec-list">
          {draft.rules.map((r) => {
            const effect = effects?.find((e) => e.id === r.id);
            return (
              <li key={r.id} className="sec-row">
                <div className="sec-main">
                  <span className="sec-name">
                    {[
                      r.match.payee && `Empfänger „${r.match.payee}“`,
                      r.match.memo && `Notiz enthält „${r.match.memo}“`,
                      r.match.category && `YNAB-Kategorie ${r.match.category}`,
                    ]
                      .filter(Boolean)
                      .join(' und ')}{' '}
                    → {targetName(r.set.category)}
                  </span>
                  <span className="sec-meta">
                    ab {monthLabel(r.from ?? draft.rulesFrom ?? draft.startMonth)}
                    {effect && ` · ${effect.count} Buchungen, ${eur(effect.sumCents)}`}
                  </span>
                  {effect && effect.samples.length > 0 && (
                    <ul className="imp-samples">
                      {effect.samples.slice(0, 5).map((s, i) => (
                        <li key={i}>
                          {longDay(s.date)} · {s.payee} · {eur(s.amountCents)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => edit((m) => void (m.rules = m.rules.filter((x) => x.id !== r.id)))}
                >
                  Entfernen
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="imp-rule-form">
        {field(
          'Empfänger',
          <Select
            aria-label="Empfänger"
            value={rule.payee}
            onChange={(e) => setRule({ ...rule, payee: e.target.value })}
          >
            <option value="">–</option>
            {overview.payees.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>,
        )}
        {field(
          'Notiz enthält',
          <TextInput
            aria-label="Notiz enthält"
            value={rule.memo}
            onChange={(e) => setRule({ ...rule, memo: e.target.value })}
          />,
        )}
        {field(
          'YNAB-Kategorie',
          <Select
            aria-label="YNAB-Kategorie"
            value={rule.category}
            onChange={(e) => setRule({ ...rule, category: e.target.value })}
          >
            <option value="">–</option>
            {overview.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.key}
              </option>
            ))}
          </Select>,
        )}
        {field(
          'Neue Kategorie',
          <Select
            aria-label="Neue Kategorie"
            value={rule.target}
            onChange={(e) => setRule({ ...rule, target: e.target.value })}
          >
            <option value="">–</option>
            <option value="tbb">Zu verteilen</option>
            {Object.entries(draft.targets).map(([id, t]) => (
              <option key={id} value={id}>
                {t.group}: {t.name}
              </option>
            ))}
          </Select>,
        )}
        {field(
          'Ab Monat (sonst oben)',
          <Select
            aria-label="Ab Monat (sonst oben)"
            value={rule.from}
            onChange={(e) => setRule({ ...rule, from: e.target.value })}
          >
            <option value="">–</option>
            {overview.months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>,
        )}
        <Button variant="ghost" size="sm" onClick={add}>
          Regel hinzufügen
        </Button>
      </div>
      {draft.rules.length > 0 && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void preview()}>
          Betroffene Buchungen zeigen
        </Button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

export function PayeesStep({ overview, draft, setDraft }: StepProps) {
  const [filter, setFilter] = useState('');
  const shown = overview.payees
    .filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 100);
  const change = (name: string, key: 'name' | 'contact', value: string) => {
    const next = clone(draft);
    const entry = { ...next.payees[name], [key]: value || undefined };
    if (!entry.name) delete entry.name;
    if (!entry.contact) delete entry.contact;
    if (Object.keys(entry).length === 0) delete next.payees[name];
    else next.payees[name] = entry;
    setDraft(next);
  };
  return (
    <section aria-labelledby="imp-payees">
      <SectionHead id="imp-payees" title="Empfänger" aside={`${overview.payees.length} in YNAB`} />
      <p className="imp-lead">
        Umbenennen führt gleichnamige Empfänger zusammen; ein Kontakt verbindet den Empfänger mit
        einer Person. Leer lassen übernimmt den Namen aus YNAB.
      </p>
      <div className="imp-field">
        <span className="tech" aria-hidden="true">
          Suchen
        </span>
        <TextInput
          aria-label="Empfänger suchen"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <table className="ktable imp-table">
        <caption className="sr-only">Empfänger aus YNAB</caption>
        <thead>
          <tr>
            <th className="tech" scope="col">
              Empfänger
            </th>
            <th className="tech kc-num" scope="col">
              Buchungen
            </th>
            <th className="tech" scope="col">
              Neuer Name
            </th>
            <th className="tech" scope="col">
              Kontakt
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.name}>
              <td>
                <span className="kname-s">{p.name || '(ohne)'}</span>
              </td>
              <td className="kc-num" data-label="Buchungen">
                {p.count}
              </td>
              <td data-label="Neuer Name">
                <TextInput
                  aria-label={`Neuer Name für ${p.name}`}
                  value={draft.payees[p.name]?.name ?? ''}
                  onChange={(e) => change(p.name, 'name', e.target.value)}
                />
              </td>
              <td data-label="Kontakt">
                <TextInput
                  aria-label={`Kontakt für ${p.name}`}
                  value={draft.payees[p.name]?.contact ?? ''}
                  onChange={(e) => change(p.name, 'contact', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

export function StartStep({ overview, draft, setDraft }: StepProps) {
  const set = (fn: (m: Mapping) => void) => {
    const next = clone(draft);
    fn(next);
    setDraft(next);
  };
  return (
    <section aria-labelledby="imp-start">
      <SectionHead id="imp-start" title="Startmonat und Namen" />
      <p className="imp-lead">
        Die Aufzeichnung beginnt am Ersten des Startmonats. Jedes Konto startet mit der Summe seiner
        Buchungen davor, jede Zielkategorie mit dem Verfügbar ihrer YNAB-Kategorien im Vormonat;
        verworfene Kategorien fließen nach Zu verteilen. Konten, die davor geschlossen wurden,
        entfallen.
      </p>
      <label className="imp-field">
        <span className="tech">Startmonat</span>
        <Select
          aria-label="Startmonat"
          value={draft.startMonth}
          onChange={(e) => set((m) => void (m.startMonth = e.target.value))}
        >
          {overview.months.slice(1).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
      </label>
      <ul className="sec-list">
        <li className="sec-row">
          <span id="imp-notes" className="sec-main">
            <strong>Klammer-Notizen aus Namen entfernen</strong>
            <small className="sec-meta">
              z. B. „[€ 30,- am 01.]“; Betrag und Termin werden zu Vorschlägen
            </small>
          </span>
          <Switch
            labelledBy="imp-notes"
            checked={draft.names.stripNotes}
            onChange={(v) => set((m) => void (m.names.stripNotes = v))}
          />
        </li>
        <li className="sec-row">
          <span id="imp-emoji" className="sec-main">
            <strong>Emoji aus Namen entfernen</strong>
          </span>
          <Switch
            labelledBy="imp-emoji"
            checked={draft.names.stripEmoji}
            onChange={(v) => set((m) => void (m.names.stripEmoji = v))}
          />
        </li>
        <li className="sec-row">
          <span id="imp-expected" className="sec-main">
            <strong>Erwartete Zahlungen aus den Notizen vorschlagen</strong>
          </span>
          <Switch
            labelledBy="imp-expected"
            checked={draft.expectedPayments.fromNotes}
            onChange={(v) => set((m) => void (m.expectedPayments.fromNotes = v))}
          />
        </li>
      </ul>
    </section>
  );
}
