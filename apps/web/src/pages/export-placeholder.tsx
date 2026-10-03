import { Button, SectionHead, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { ApiError } from '../api/http';
import { authErrorMessage, withStepUp } from '../auth/webauthn';
import { CSV_EXPORT_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';

async function downloadCsvZip(): Promise<void> {
  const response = await fetch('/api/export/csv.zip', { credentials: 'same-origin' });
  if (!response.ok) {
    let code = 'unknown';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') code = body.error;
    } catch {
      // Keep a fixed error; response bodies may contain server details that belong in no UI.
    }
    throw new ApiError(response.status, code);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename =
    disposition.match(/filename="(budget-export-\d{4}-\d{2}-\d{2}\.zip)"/)?.[1] ??
    'budget-export.zip';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportPlaceholderPage() {
  useAmountPrivacy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const download = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await withStepUp(downloadCsvZip);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageFrame meta={CSV_EXPORT_META}>
      <section className="placeholder" aria-labelledby="export-title">
        <SectionHead id="export-title" title="CSV-Export" />
        <p>Alle Konten und Depots als CSV-Dateien in einer ZIP-Datei herunterladen.</p>
        <p className="text-muted">
          Kontostände und Positionen entsprechen dem heutigen Stand; Buchungen und Quellenverläufe
          bleiben vollständig. Zum Schutz deiner Daten ist eine frische Passkey-Bestätigung
          erforderlich.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {maskMoneyText(error)}
          </p>
        )}
        <Button disabled={busy} onClick={() => void download()}>
          {busy ? 'Export wird erstellt …' : 'ZIP-Export herunterladen'}
        </Button>
      </section>
    </PageFrame>
  );
}
