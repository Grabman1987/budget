import { Link } from '@tanstack/react-router';
import { PaceChart, PaceLegend } from '../charts/pace-chart';
import { SankeyChart } from '../charts/sankey-chart';
import { useElementWidth } from '../charts/use-element-width';

/** P1a chart spike: own SVG on d3-scale/d3-shape, see docs/adr/0001-charts.md. */
export function ChartsSpikePage() {
  const [paceRef, paceWidth] = useElementWidth<HTMLDivElement>();
  const [sankeyRef, sankeyWidth] = useElementWidth<HTMLDivElement>();
  return (
    <main className="spike">
      <h1>Diagramm-Spike</h1>
      <p className="spike-intro">
        Beispieldaten, kein echtes Hauptbuch. Beide Diagramme sind eigenes SVG auf d3-scale und
        d3-shape, gezeichnet in den Linienarten der Blaupause. <Link to="/">Zurück</Link>
      </p>

      <section aria-labelledby="pace-title">
        <h2 id="pace-title">Heute: Tempo der Ausgaben</h2>
        <p className="spike-note">Kumulierte Ausgaben im Monat gegen Plan und Vormonat.</p>
        <div className="chart-frame" ref={paceRef}>
          <PaceChart width={paceWidth} />
        </div>
        <PaceLegend />
      </section>

      <section aria-labelledby="flow-title">
        <h2 id="flow-title">Geldfluss</h2>
        <p className="spike-note">Einnahmen in einen Topf, dann Klassen und Gruppen.</p>
        <div className="chart-frame" ref={sankeyRef}>
          <SankeyChart width={sankeyWidth} />
        </div>
      </section>
    </main>
  );
}
