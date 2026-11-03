import { Button, SectionHead, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { ApiError } from '../api/http';
import { authErrorMessage, withStepUp } from '../auth/webauthn';
import { CSV_EXPORT_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';

import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { Download, ShieldCheck } from 'lucide-react';

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

  if (REDESIGN_ENABLED)
    return (
      <PageFrame meta={CSV_EXPORT_META}>
        <section className="settings-data-v2" aria-labelledby="export-title">
          <div className="settings-primary-head">
            <h2 id="export-title">CSV-Export</h2>
          </div>
          <div className="settings-surface">
            <div className="settings-row">
              <div className="settings-security-copy">
                <Download size={20} aria-hidden="true" />
                <div>
                  <strong>Datenexport als CSV</strong>
                  <small>Konten, Depots, Buchungen und Quellenverläufe · ZIP-Datei</small>
                </div>
              </div>
              <Button disabled={busy} onClick={() => void download()}>
                {busy ? 'Export wird erstellt …' : 'ZIP-Export herunterladen'}
              </Button>
            </div>
          </div>
          <p className="settings-source-stamp">
            Kontostände und Positionen zum heutigen Stand. Eine frische Passkey-Bestätigung schützt
            den Download.
          </p>
          {error && <p role="alert">{maskMoneyText(error)}</p>}
          <h3 className="settings-section-title">Verschlüsselte Sicherung</h3>
          <div className="settings-surface">
            <div className="settings-row">
              <div className="settings-security-copy">
                <ShieldCheck size={20} aria-hidden="true" />
                <div>
                  <strong>Vollständige Sicherung</strong>
                  <small>Der verschlüsselte Backup-Download ist derzeit nicht verfügbar.</small>
                </div>
              </div>
              <span className="settings-source-stamp">Nicht verfügbar</span>
            </div>
          </div>
          <p className="settings-source-stamp">
            Der CSV-Export ist ein Datenauszug. Er ersetzt keine vollständige verschlüsselte
            Sicherung zur Wiederherstellung.
          </p>
        </section>
      </PageFrame>
    );
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
