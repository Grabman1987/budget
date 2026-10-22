import { Button, SectionHead, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { authErrorMessage, withStepUp } from '../auth/webauthn';
import { settingsSectionMeta } from '../settings/navigation';
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

type ExportStatus = {
  lastCompletedAt: string | null;
  historyScope: 'durable-last-observation';
  backup: {
    configured: boolean | null; running: boolean; latestKnownArchiveDay: string | null;
    inventoryCheckedAt: string | null; lastCompletedAt: string | null; lastFailureAt: string | null; lastAttemptFailed: boolean;
  };
};
const stamp = (value: string | null) => value ? new Date(value).toLocaleString('de-AT') : 'Nicht aufgezeichnet';
const contents = [
  'accounts.csv', 'bookings.csv', 'securities.csv', 'positions.csv', 'trades.csv',
  'prices.csv', 'holdings.csv', 'valuations.csv', 'fx_rates.csv', 'savings_plans.csv',
  'asset_classes.csv', 'security_exposure_versions.csv', 'security_asset_exposures.csv',
  'asset_class_targets.csv', 'asset_target_policies.csv',
];

export function ExportPlaceholderPage() {
  useAmountPrivacy();
  const status = useQuery({ queryKey: ['export-status'], queryFn: () => request<ExportStatus>('GET', '/api/export/status'), refetchInterval: 30_000 });
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const download = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await withStepUp(downloadCsvZip);
      setReceivedAt(new Date().toISOString());
      await status.refetch();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageFrame meta={settingsSectionMeta('daten-export')}>
      <section className="placeholder" aria-labelledby="export-title">
        <SectionHead id="export-title" title="CSV-Export" />
        <p>Konten, Buchungen, Instrumente und Portfolio-Verläufe als CSV-Dateien in einer ZIP-Datei herunterladen.</p>
        <details><summary>Inhalt des Exports (15 CSV-Dateien)</summary>
          <ul>{contents.map((file) => <li key={file}>{file}</li>)}</ul>
          <p>Der CSV-Export enthält keine PDF-Belege, Passkeys oder vollständige App-Konfiguration. Er ist kein vollständiges Wiederherstellungsarchiv.</p>
        </details>
        <p className="text-muted">
          Kontostände und Positionen entsprechen dem heutigen Stand; gespeicherte Buchungen, Kurs-
          und Wechselkursverläufe sind enthalten. Zum Schutz deiner Daten ist eine frische Passkey-Bestätigung
          erforderlich.
        </p>
        {status.isPending && <p role="status">Export- und Sicherungsstatus wird geladen …</p>}
        {status.isError && <p role="alert">Export- und Sicherungsstatus derzeit nicht verfügbar. <Button variant="ghost" onClick={() => void status.refetch()}>Erneut laden</Button></p>}
        {receivedAt && <p role="status">ZIP in diesem Seitenbesuch vollständig empfangen: {stamp(receivedAt)}. Ob die Datei auf deinem Gerät gespeichert wurde, kann die App nicht feststellen.</p>}
        {status.data && <p>Zuletzt protokollierter serverseitig abgeschlossener CSV-Export: {stamp(status.data.lastCompletedAt)}. Ein aufgezeichneter Zeitpunkt bleibt nach einem Serverneustart erhalten; er bestätigt weder einen Download auf dein Gerät noch eine Wiederherstellung.</p>}
        {error && (
          <p className="field-error" role="alert">
            {maskMoneyText(error)}
          </p>
        )}
        <Button disabled={busy} onClick={() => void download()}>
          {busy ? 'Export wird erstellt …' : 'ZIP-Export herunterladen'}
        </Button>
      </section>
      <section className="placeholder" aria-labelledby="backup-title">
        <SectionHead id="backup-title" title="Verschlüsselte Sicherung" />
        {status.data && <>
          <p>{status.data.backup.configured === null ? 'Sicherungsstatus von diesem Server nicht verfügbar.'
            : !status.data.backup.configured ? 'Automatische verschlüsselte Sicherung auf diesem Server nicht eingerichtet.'
              : status.data.backup.running ? 'Eine Sicherung läuft.'
                : status.data.backup.lastAttemptFailed ? 'Der letzte Sicherungsversuch ist fehlgeschlagen. Der bestehende Zeitplan versucht es erneut.'
                  : 'Sicherung eingerichtet. Die Angaben unten stammen aus beobachteten Läufen und der beim Start gelesenen Archivliste.'}</p>
          {status.data.backup.configured && <dl>
            <dt>Neuester bekannter Archivtag (UTC)</dt><dd>{status.data.backup.latestKnownArchiveDay ?? 'Kein Archivtag bekannt'}</dd>
            <dt>Archivliste zuletzt gelesen</dt><dd>{stamp(status.data.backup.inventoryCheckedAt)}</dd>
            <dt>In diesem Serverprozess erfolgreich abgeschlossen</dt><dd>{stamp(status.data.backup.lastCompletedAt)}</dd>
            <dt>Letzter fehlgeschlagener Versuch seit Serverstart</dt><dd>{stamp(status.data.backup.lastFailureAt)}</dd>
          </dl>}
        </>}
        <p>Die verschlüsselte Sicherung enthält Datenbank und zugehörige Belegdateien. Sie wird am Server eingerichtet und ab 02:00 UTC mit Nachholen und Fehlerpause ausgeführt. Eine Wiederherstellungsprüfung wird hier nicht erfasst; ein bekannter Archivtag bestätigt keine erfolgreiche Wiederherstellung.</p>
        <p>Fehler erscheinen einmal als Aufgabe unter Prüfen. Zugangsdaten und Entschlüsselungsschlüssel werden hier nicht angezeigt oder geändert.</p>
      </section>
    </PageFrame>
  );
}
