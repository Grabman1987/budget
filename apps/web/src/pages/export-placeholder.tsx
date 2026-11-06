import { Button, SectionHead, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { ApiError } from '../api/http';
import { authErrorMessage, withStepUp } from '../auth/webauthn';
import { CSV_EXPORT_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';

import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { Download, ShieldCheck } from 'lucide-react';

async function downloadFile(backup: boolean): Promise<string> {
  const response = await fetch(backup ? '/api/export/backup.age' : '/api/export/csv.zip', {
    credentials: 'same-origin',
  });
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
    (backup
      ? disposition.match(/filename="(budget-\d{4}-\d{2}-\d{2}\.tar\.age)"/)?.[1]
      : disposition.match(/filename="(budget-export-\d{4}-\d{2}-\d{2}\.zip)"/)?.[1]) ??
    (backup ? 'budget-backup.tar.age' : 'budget-export.zip');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function ExportPlaceholderPage() {
  useAmountPrivacy();
  const [busy, setBusy] = useState<'csv' | 'backup' | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [backupFilename, setBackupFilename] = useState<string>();

  const download = async (backup = false) => {
    if (busy) return;
    setBusy(backup ? 'backup' : 'csv');
    setError(undefined);
    try {
      const filename = await withStepUp(() => downloadFile(backup));
      if (backup) setBackupFilename(filename);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'backup_missing'
          ? 'Es ist noch keine abgeschlossene verschlüsselte Sicherung verfügbar. Bitte nach dem nächsten Nachtlauf erneut versuchen.'
          : caught instanceof ApiError && caught.code === 'backup_unavailable'
            ? 'Die verschlüsselte Sicherung konnte nicht vollständig geprüft und geladen werden. Bitte später erneut versuchen.'
            : caught instanceof ApiError && caught.code === 'export_busy'
              ? 'Ein Download läuft bereits. Bitte warte, bis er abgeschlossen ist.'
              : authErrorMessage(caught),
      );
    } finally {
      setBusy(null);
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
              <Button disabled={busy !== null} onClick={() => void download()}>
                {busy === 'csv' ? 'Export wird erstellt …' : 'ZIP-Export herunterladen'}
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
                  <strong>Letzte abgeschlossene Nachtsicherung</strong>
                  <small>
                    Datenbank mit Anmeldedaten und gespeicherten Belegen · age-verschlüsseltes
                    TAR-Archiv
                  </small>
                </div>
              </div>
              <Button disabled={busy !== null} onClick={() => void download(true)}>
                {busy === 'backup'
                  ? 'Sicherung wird geladen …'
                  : 'Verschlüsselte Sicherung herunterladen'}
              </Button>
            </div>
          </div>
          <p className="settings-source-stamp">
            Der CSV-Export ist ein Datenauszug. Er ersetzt keine vollständige verschlüsselte
            Sicherung zur Wiederherstellung.
          </p>
          <p className="settings-source-stamp">
            Die Sicherung enthält den Stand des letzten erfolgreichen Nachtlaufs, nicht die neuesten
            Änderungen. Das Datum im Dateinamen bezeichnet den Sicherungstag (UTC). Auch dieser
            Download erfordert eine frische Passkey-Bestätigung.
          </p>
          <p className="settings-source-stamp">
            Zum Wiederherstellen brauchst du deinen separat aufbewahrten privaten age-Schlüssel und
            die Serverkonfiguration. Diese sind nicht enthalten. Fehlt der bisherige
            Wiederherstellungscode-Schlüssel (BUDGET_PEPPER), müssen nach der Anmeldung mit Passkey
            neue Wiederherstellungscodes erstellt werden. Das Archiv zuerst außerhalb der App
            entschlüsseln und prüfen; Datenbank und Belege anschließend gemeinsam im Wartungsmodus
            wiederherstellen. Der Download verändert keine Daten und startet keine
            Wiederherstellung.
          </p>
          {backupFilename && <p role="status">Sicherung heruntergeladen: {backupFilename}</p>}
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
        <Button disabled={busy !== null} onClick={() => void download()}>
          {busy === 'csv' ? 'Export wird erstellt …' : 'ZIP-Export herunterladen'}
        </Button>
      </section>
    </PageFrame>
  );
}
