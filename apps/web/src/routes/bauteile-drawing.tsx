import { SectionHead, useTheme } from '@budget/ui';
import { ArrowLeftRight, ChartColumn, Check, ChevronDown, CircleAlert, CircleCheck, Clock, Info, Table2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './bauteile-drawing.css';

const PAIRS = [
  { foreground: 'ink', background: 'surface', minimum: 4.5, role: 'Text' },
  { foreground: 'ink-2', background: 'surface', minimum: 4.5, role: 'Sekundärtext' },
  { foreground: 'ink-3', background: 'surface', minimum: 4.5, role: 'Metadaten' },
  { foreground: 'on-primary', background: 'primary', minimum: 4.5, role: 'Schaltfläche' },
  { foreground: 'rule-strong', background: 'surface', minimum: 3, role: 'Feldgrenze' },
] as const;
const ICONS = [
  { Icon: TriangleAlert, label: 'Warnung' }, { Icon: CircleAlert, label: 'Fehler' },
  { Icon: Info, label: 'Hinweis' }, { Icon: CircleCheck, label: 'Erfolg' },
  { Icon: Check, label: 'Liste' }, { Icon: Clock, label: 'Zeit' },
  { Icon: ArrowLeftRight, label: 'Umbuchung' }, { Icon: Table2, label: 'Plan' },
  { Icon: ChartColumn, label: 'Reports' }, { Icon: ChevronDown, label: 'Aufklappen' },
];
function luminance(css: string): number | undefined {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) return;
  const channels = match.slice(1, 4).map((value) => Number(value) / 255);
  if (channels.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return;
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
/** Computed values describe this browser's current theme, not a blanket accessibility verdict. */
export function DrawingCatalog() {
  const [theme] = useTheme();
  const probes = useRef<Array<HTMLSpanElement | null>>([]);
  const [ratios, setRatios] = useState<Array<number | undefined>>([]);
  useEffect(() => {
    const measure = () => setRatios(PAIRS.map((_, index) => {
      const node = probes.current[index];
      if (!node) return;
      const style = getComputedStyle(node);
      const foreground = luminance(style.color), background = luminance(style.backgroundColor);
      if (foreground === undefined || background === undefined) return;
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }));
    measure();
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', measure);
    return () => system.removeEventListener('change', measure);
  }, [theme]);
  return <>
    <section aria-labelledby="kontrastmatrix">
      <SectionHead id="kontrastmatrix" title="Kontrastmatrix der aktuellen Darstellung" />
      <p className="dev-note">Aus den berechneten Tokenfarben dieses Browsers. Die Matrix ersetzt keine vollständige Barrierefreiheitsprüfung.</p>
      <div className="dev-table-scroll"><table className="drawing-contrast">
        <caption className="sr-only">Textkontrast 4,5 zu 1; Feldgrenzen 3 zu 1</caption>
        <thead><tr><th scope="col">Rolle</th><th scope="col">Tokenpaar</th><th scope="col">Verhältnis</th><th scope="col">Ziel</th></tr></thead>
        <tbody>{PAIRS.map((pair, index) => <tr key={pair.foreground}>
          <th scope="row">{pair.role}</th>
          <td><span ref={(node) => { probes.current[index] = node; }} className="drawing-contrast-sample"
            style={{ color: `var(--${pair.foreground})`, backgroundColor: `var(--${pair.background})` } as CSSProperties}>
            {pair.foreground} / {pair.background}
          </span></td>
          <td>{ratios[index] === undefined ? 'Nicht ermittelt' : `${ratios[index]!.toFixed(2).replace('.', ',')} : 1`}</td>
          <td>{pair.minimum.toLocaleString('de-AT')} : 1 · {ratios[index] === undefined ? 'offen' : ratios[index]! >= pair.minimum ? 'erreicht' : 'prüfen'}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section aria-labelledby="iconraster">
      <SectionHead id="iconraster" title="Icons · Bedeutung und Größen" />
      <p className="dev-note">16 px mit Strich 1,75; 20 und 24 px mit Strich 1,5. Muster ohne fachliche Aktion.</p>
      <ul className="drawing-icon-grid">{ICONS.map(({ Icon, label }) => <li key={label}>
        <span>{label}</span><span className="drawing-icon-sizes" aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} /><Icon size={20} strokeWidth={1.5} /><Icon size={24} strokeWidth={1.5} />
        </span>
      </li>)}</ul>
    </section>
  </>;
}
