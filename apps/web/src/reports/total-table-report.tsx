import { buildTableRows, tableCsv, type TableMeta, type TableRow } from '@budget/domain';
import { Button, Segmented } from '@budget/ui';
import { Download } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { RowsGrid, type GridColumn } from './table-grid';
import { monthLong, monthShort } from './table-format';
import { TableReportFrame, useReportTables } from './table-report-frame';
import type { ReportTables } from './table-reports-api';

const DEPTH = [
  { value: 'gruppen', label: 'Gruppen' },
  { value: 'kategorien', label: 'Kategorien' },
] as const;

/** 1.8 Gesamttabelle: every month since the budget start in one table, with a CSV of the same. */
export function TotalTableReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const query = useReportTables(true);
  return (
    <TableReportFrame
      report={report}
      meta={meta}
      through="current"
      query={query}
      className="total-report"
    >
      {(data) => <TotalBody data={data} />}
    </TableReportFrame>
  );
}

function TotalBody({ data }: { data: ReportTables }) {
  const [depth, setDepth] = useState<(typeof DEPTH)[number]['value']>('gruppen');
  const meta: TableMeta = data;
  const scroll = useRef<HTMLDivElement>(null);
  const partial = data.lastFullMonth !== data.currentMonth;
  const columns: GridColumn[] = data.months.map((m) => ({
    key: m.month,
    label: `${monthShort(m.month)}${partial && m.month === data.currentMonth ? '*' : ''}`,
    title: monthLong(m.month),
  }));
  const rows = useMemo(() => {
    const base = buildTableRows(data.months, meta, depth === 'kategorien');
    const netWorth: TableRow = {
      key: 'nw',
      label: 'Nettovermögen am Monatsende',
      kind: 'level',
      level: 0,
      good: null,
      vals: data.months.map((m) => m.netWorthCents),
    };
    return [...base, netWorth];
  }, [data.months, meta, depth]);

  // The table starts at the running month: scroll the past out to the left.
  useEffect(() => {
    const toEnd = () => {
      const el = scroll.current;
      if (el) el.scrollLeft = el.scrollWidth;
    };
    toEnd();
    // The web fonts change the column widths once they are loaded.
    void document.fonts?.ready.then(toEnd);
  }, [data.months.length]);

  const download = () => {
    const csv = tableCsv(
      rows,
      columns.map((c) => c.label),
    );
    // Excel needs the byte order mark to read UTF-8 (umlauts) in the German locale.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gesamttabelle-${data.firstMonth}-${data.currentMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  return (
    <section className="tr-card" aria-labelledby="total-title">
      <div className="tbd-head">
        <h2 id="total-title">
          {data.firstMonth ? `Alle Monate seit ${monthShort(data.firstMonth)}` : 'Alle Monate'}
        </h2>
        <div className="rtools">
          <Segmented
            label="Detailtiefe"
            options={DEPTH}
            value={depth}
            onChange={setDepth}
            className="seg-depth"
          />
          <Button variant="ghost" size="sm" onClick={download} data-testid="csv-download">
            <Download size={16} strokeWidth={1.75} aria-hidden="true" />
            CSV
          </Button>
        </div>
      </div>
      <RowsGrid
        ref={scroll}
        rows={rows}
        columns={columns}
        caption="Gesamttabelle: alle Monate in Euro"
        regionLabel="Gesamttabelle, bei Bedarf horizontal verschiebbar"
        total={false}
        className="rg-all"
      />
      {data.netWorth === 'unavailable' && (
        <p className="vnote" role="status">
          Das Nettovermögen am Monatsende ist nicht verfügbar: Für die Bewertung fehlt ein Kurs oder
          Wechselkurs.
        </p>
      )}
      <p className="vnote">
        Beträge in Euro, Konsum = Bedarf plus Wunsch.{' '}
        {partial && data.currentMonth
          ? `* ${monthLong(data.currentMonth)} läuft noch, die Spalte zeigt den Stand bis heute. `
          : ''}
        Farbe je Zeile gegen den Durchschnitt: Rot = teurer Monat, Grün = günstiger. Kapitalerträge
        stehen getrennt am Ende und zählen nicht zu den Einnahmen oder zur Sparquote; Erstattungen
        mindern die Ausgaben ihrer Kategorie. Die Tabelle beginnt rechts beim aktuellen Monat; nach
        links in die Vergangenheit scrollen. Die CSV enthält genau diese Zeilen und Spalten.
      </p>
    </section>
  );
}
