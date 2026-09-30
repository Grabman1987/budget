import { cents } from '@budget/domain';
import { formatEuro } from '@budget/domain/money';
import {
  AmountInput,
  BottomSheet,
  Button,
  ClassTag,
  Count,
  DimensionChain,
  DimensionChainDrawing,
  Field,
  PartsList,
  Registers,
  RevisionTable,
  SectionHead,
  Segmented,
  SidePanel,
  SourceStamp,
  StatusMark,
  Switch,
  TextInput,
  TitleBlock,
  ToastProvider,
  useTheme,
  useToast,
  type RevisionRow,
  type ThemePreference,
} from '@budget/ui';
import { Link } from '@tanstack/react-router';
import { useState, type CSSProperties } from 'react';
import { ChartPrimitivesShowcase } from './bauteile-charts';

const TOKEN_ROLES = [
  'ground',
  'ground-2',
  'raised',
  'ink',
  'ink-2',
  'ink-3',
  'line',
  'line-2',
  'rule',
  'rule-strong',
  'graticule',
  'primary',
  'red',
  'need',
  'want',
  'future',
  'tint',
  'tint-2',
  'heat-green',
  'heat-red',
  'good-ink',
  'bad-ink',
] as const;

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const eur = (v: number) => formatEuro(cents(v));

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <Segmented<ThemePreference>
      label="Darstellung"
      options={THEME_OPTIONS}
      value={theme}
      onChange={setTheme}
    />
  );
}

function Tokens() {
  return (
    <section aria-labelledby="farben" id="farben">
      <SectionHead id="farben" title="Farben und Schrift" detail={1} />
      <div className="swatch-grid">
        {TOKEN_ROLES.map((role) => (
          <div className="token" key={role}>
            <i style={{ '--swatch': `var(--${role})` } as CSSProperties} />
            <code>{role}</code>
          </div>
        ))}
      </div>
      <div className="dev-row">
        <ClassTag kind="need">Bedarf</ClassTag>
        <ClassTag kind="want">Wunsch</ClassTag>
        <ClassTag kind="future">Zukunft</ClassTag>
        <ClassTag kind="bound">Gebunden</ClassTag>
        <ClassTag kind="debt">Schulden</ClassTag>
        <ClassTag kind="open">Zu verteilen</ClassTag>
      </div>
      <div>
        <p className="type-sample t-dimension">
          1.234<span className="cents">,56 €</span>
        </p>
        <p className="type-sample t-display">September 2026</p>
        <p className="type-sample t-headline">Headline: frei verfügbar bis Gehalt</p>
        <p className="type-sample t-title">Title: Abschnittskopf</p>
        <p className="type-sample t-figure">Figure: 3.812 €</p>
        <p className="type-sample">Body 14 px mit Tabellenziffern: 1.111 · 2.222 · 3.333</p>
        <p className="type-sample tech">Label · Barlow Semi Condensed</p>
      </div>
    </section>
  );
}

function Basics() {
  const [period, setPeriod] = useState('3M');
  const [auto, setAuto] = useState(true);
  const [text, setText] = useState('');
  return (
    <section aria-labelledby="grundbausteine" id="grundbausteine">
      <SectionHead
        id="grundbausteine"
        title="Schaltflächen, Segmente, Schalter, Stempel"
        detail={2}
      />
      <div className="dev-row">
        <Button>Buchung</Button>
        <Button variant="ghost">Posteingang</Button>
        <Button variant="alert">Decken</Button>
        <Button size="sm" variant="ghost">
          Klein
        </Button>
        <Button disabled>Deaktiviert</Button>
      </div>
      <div className="dev-row">
        <Segmented
          label="Zeitraum"
          value={period}
          onChange={setPeriod}
          options={['1M', '3M', 'YTD', '1J', '3J', 'Alles'].map((v) => ({ value: v, label: v }))}
        />
        <div className="dev-row">
          <Switch labelledBy="dev-auto-label" checked={auto} onChange={setAuto} />
          <span id="dev-auto-label">Automatisch</span>
        </div>
      </div>
      <div className="dev-row">
        <SourceStamp>Bank-Sync heute 06:30</SourceStamp>
        <SourceStamp>Import 14.09.</SourceStamp>
        <SourceStamp stale>manuell · 15.03.</SourceStamp>
        <StatusMark status="met" />
        <StatusMark status="warning" />
        <StatusMark status="violated" />
        <StatusMark status="violated" actionNeeded>
          Überzogen
        </StatusMark>
        <span>
          Posteingang <Count>12</Count> <Count tone="alert">2</Count>
        </span>
      </div>
      <div className="dev-grid">
        <Field label="Empfänger" hint="Freitext oder aus der Liste">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="z. B. Supermarkt"
            />
          )}
        </Field>
        <Field label="Kategorie" error="Kategorie ist Pflicht bei Ausgaben.">
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>
      </div>
    </section>
  );
}

function Amount() {
  const [value, setValue] = useState('12,50+8,20');
  const [committed, setCommitted] = useState<number | null>(null);
  return (
    <section aria-labelledby="betrag" id="betrag">
      <SectionHead id="betrag" title="Betragsfeld" detail={3} />
      <p className="dev-note">
        Rechnen direkt im Feld (+ − × ÷, auch * / x :), Tausenderpunkte wie 1.576, Enter übernimmt
        das Ergebnis. Kein eval, kein Ziffernblock.
      </p>
      <div className="dev-grid">
        <AmountInput
          label="Betrag"
          value={value}
          onChange={setValue}
          onCommit={(c) => setCommitted(c)}
          sign={'−'}
        />
        <p data-testid="amount-committed">
          Übernommen: <strong>{committed === null ? 'noch nichts' : eur(committed)}</strong>
        </p>
      </div>
    </section>
  );
}

function Chains() {
  const [panel, setPanel] = useState<string | null>(null);
  const [drawingOpen, setDrawingOpen] = useState(true);
  return (
    <section aria-labelledby="massketten" id="massketten">
      <SectionHead id="massketten" title="Maßkette (inline)" detail={4} />
      <p className="dev-note">
        Gerundete Teile werden so ausgeglichen, dass die Kette wie angezeigt aufgeht: 333,40 +
        333,40 + 333,40 = 1.000,20 zeigt 334 + 333 + 333 = 1.000.
      </p>
      <DimensionChain
        label="Zu verteilen: Übertrag plus Einnahmen minus Zugewiesen"
        terms={[
          { label: 'Übertrag', value: cents(33340), onSelect: () => setPanel('Übertrag') },
          {
            label: 'Einnahmen',
            value: cents(33340),
            op: '+',
            onSelect: () => setPanel('Einnahmen'),
          },
          { label: 'Ungedeckt', value: cents(33340), op: '+' },
          { label: 'Zu verteilen', value: cents(100020), op: '=' },
        ]}
      />
      <DimensionChain
        label="Ohne Ausgleich, mit Cent"
        precision="cent"
        terms={[
          { label: 'Anfang', value: cents(123456) },
          { label: 'Zugewiesen', value: cents(23456), op: '-' },
          { label: 'Frei', value: cents(100000), op: '=' },
        ]}
      />
      <SectionHead id="massketten-gezeichnet" title="Maßkette (gezeichnet)" />
      <p className="dev-note">
        Teilmaße über einem 14-px-Balken in Klassenfüllung, darunter der gebundene Teil (Schraffur)
        oder eine Schuld (gestrichelt), unten das Ergebnis. Segmente sind per Tastatur bedienbar und
        öffnen ihre Einzelposten. Die Linien werden gezogen wie von einem Plotter (900 ms), die
        Kette klappt in 240 ms auf; bei reduzierter Bewegung erscheint alles sofort.
      </p>
      <p>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={drawingOpen}
          aria-controls="kette-frei"
          onClick={() => setDrawingOpen((open) => !open)}
        >
          {drawingOpen ? 'Maßkette ausblenden' : 'Maßkette zeigen'}
        </Button>
      </p>
      <div id="kette-frei">
        <DimensionChainDrawing
          label="Frei verfügbar bis Gehalt: Bedarf plus Wunsch minus offen bis Gehalt"
          open={drawingOpen}
          onSelect={(key) => setPanel(key)}
          parts={[
            { key: 'Bedarf', label: 'Bedarf', cents: cents(128000), fill: 'need' },
            { key: 'Wunsch', label: 'Wunsch', cents: cents(42000), fill: 'want' },
          ]}
          minus={{ key: 'offen', label: 'offen bis Gehalt', cents: cents(30000), kind: 'bound' }}
          result={{ label: 'frei verfügbar', cents: cents(140000) }}
        />
      </div>
      <DimensionChainDrawing
        label="Nettovermögen: Budget-Konten, Sparen, Investment minus Schulden"
        onSelect={(key) => setPanel(key)}
        parts={[
          { key: 'Budget-Konten', label: 'Budget-Konten', cents: cents(116700), fill: 'need' },
          { key: 'Sparen', label: 'Sparen', cents: cents(773900), fill: 'future' },
          { key: 'Investment', label: 'Investment', cents: cents(8800000), fill: 'want' },
        ]}
        minus={{ key: 'Schulden', label: 'Schulden', cents: cents(1217600), kind: 'debt' }}
        result={{ label: 'Nettovermögen', cents: cents(8473000) }}
      />
      <SidePanel open={panel !== null} onClose={() => setPanel(null)} title={panel ?? ''}>
        <p>Einzelposten von „{panel}“ erscheinen hier im Seitenpanel.</p>
      </SidePanel>
    </section>
  );
}

interface Envelope {
  id: string;
  name: string;
  assigned: number;
  available: number;
}

const GROUPS = [
  {
    id: 'fix',
    title: 'Fixkosten und Mindestraten',
    summary: { assigned: eur(129000), available: eur(0) },
    note: 'gedeckt',
    rows: [
      { id: 'rent', name: 'Miete', assigned: 89000, available: 0 },
      { id: 'power', name: 'Strom', assigned: 12000, available: 0 },
      { id: 'ins', name: 'Versicherungen', assigned: 28000, available: 0 },
    ] satisfies Envelope[],
  },
  {
    id: 'run',
    title: 'Laufender Monat',
    summary: { assigned: eur(72000), available: eur(9660) },
    rows: [
      { id: 'food', name: 'Lebensmittel', assigned: 57200, available: 18800 },
      { id: 'fuel', name: 'Treibstoff', assigned: 14800, available: -9660 },
    ] satisfies Envelope[],
  },
];

function Lists() {
  return (
    <section aria-labelledby="stueckliste" id="stueckliste">
      <SectionHead id="stueckliste" title="Stückliste" detail={5} />
      <PartsList<Envelope>
        caption="Envelopes nach Stufen"
        getRowKey={(r) => r.id}
        groups={GROUPS}
        columns={[
          { key: 'name', header: 'Kategorie', render: (r) => r.name },
          { key: 'assigned', header: 'Zugewiesen', numeric: true, render: (r) => eur(r.assigned) },
          {
            key: 'available',
            header: 'Verfügbar',
            numeric: true,
            render: (r) =>
              r.available < 0 ? (
                <span className="text-alert">{eur(r.available)}</span>
              ) : (
                eur(r.available)
              ),
          },
        ]}
      />
    </section>
  );
}

const INITIAL_REVISIONS: RevisionRow[] = [
  { id: 'a', letter: 'A', title: 'Treibstoff überzogen', detail: '96,60 € fehlen', urgent: true },
  { id: 'b', letter: 'B', title: '12 Buchungen im Posteingang', detail: 'Zuordnen und prüfen' },
  { id: 'c', letter: 'C', title: 'Sparziel Urlaub', detail: '150,00 € fehlen bis Dezember' },
];

function Revisions() {
  const [rows, setRows] = useState(INITIAL_REVISIONS);
  const { show } = useToast();
  const finish = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    const removed = rows[index];
    if (!removed) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    show({
      message: `${removed.letter} erledigt`,
      actionLabel: 'Rückgängig',
      onAction: () =>
        setRows((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        }),
    });
  };
  return (
    <section aria-labelledby="revisionen" id="revisionen">
      <SectionHead id="revisionen" title="Nächste Schritte" detail={6} />
      <RevisionTable
        caption="Nächste Schritte"
        rows={rows.map((r) => ({
          ...r,
          action: { label: r.urgent ? 'Decken' : 'Öffnen', onClick: () => finish(r.id) },
        }))}
        empty="Alles erledigt."
      />
    </section>
  );
}

function Overlays() {
  const [side, setSide] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  return (
    <section aria-labelledby="ueberlagerungen" id="ueberlagerungen">
      <SectionHead id="ueberlagerungen" title="Seitenpanel und Bottom Sheet" detail={7} />
      <p className="dev-note">
        Nativer Dialog: Fokus wird gehalten, Esc schließt, Fokus kehrt zurück. Desktop Seitenpanel,
        Handy Sheet von unten.
      </p>
      <div className="dev-row">
        <Button variant="ghost" onClick={() => setSide(true)}>
          Seitenpanel öffnen
        </Button>
        <Button variant="ghost" onClick={() => setSheet(true)}>
          Bottom Sheet öffnen
        </Button>
      </div>
      <SidePanel open={side} onClose={() => setSide(false)} title="Kontostand prüfen">
        <AmountInput label="Saldo laut Bank" value={amount} onChange={setAmount} />
        <Button onClick={() => setSide(false)}>Festschreiben</Button>
      </SidePanel>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Buchung">
        <AmountInput label="Betrag" value={amount} onChange={setAmount} sign={'−'} />
        <Button onClick={() => setSheet(false)}>Speichern</Button>
      </BottomSheet>
    </section>
  );
}

function Header() {
  const [register, setRegister] = useState('monat');
  return (
    <>
      <TitleBlock
        title="Bauteile"
        subtitle="Blaupause in Bausteinen"
        fields={[
          { label: 'Stand', value: '29.09.2026' },
          { label: 'Darstellung', value: <ThemeSwitch /> },
        ]}
      />
      <Registers
        label="Register"
        current={register}
        onSelect={setRegister}
        items={[
          { id: 'monat', label: 'Monat' },
          { id: 'jahr', label: 'Jahr' },
          { id: 'ziele', label: 'Ziele' },
        ]}
      />
    </>
  );
}

/** /dev/bauteile: every primitive of the design system in both themes. */
function ComponentsPage() {
  return (
    <main className="dev">
      <Header />
      <Tokens />
      <Basics />
      <Amount />
      <Chains />
      <Lists />
      <Revisions />
      <Overlays />
      <section aria-labelledby="diagramme" id="diagramme">
        <SectionHead id="diagramme" title="Diagramm-Bausteine" detail={8} />
        <ChartPrimitivesShowcase />
      </section>
      <p className="dev-note">
        <Link to="/dev/diagramme">Diagramm-Spike</Link> · <Link to="/">Start</Link>
      </p>
    </main>
  );
}

export function ComponentsRoute() {
  return (
    <ToastProvider>
      <ComponentsPage />
    </ToastProvider>
  );
}
