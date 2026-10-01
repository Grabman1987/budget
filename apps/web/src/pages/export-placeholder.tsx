import { SectionHead } from '@budget/ui';
import { CSV_EXPORT_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';

export function ExportPlaceholderPage() {
  return (
    <PageFrame meta={CSV_EXPORT_META}>
      <section className="placeholder" aria-labelledby="export-title">
        <SectionHead id="export-title" title="CSV-Export" />
        <p>Alle Konten und Depots in einer CSV-Datei.</p>
        <p className="text-muted">Der CSV-Export ist noch nicht verfügbar.</p>
      </section>
    </PageFrame>
  );
}
