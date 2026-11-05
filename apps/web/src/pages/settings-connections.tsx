import { SpritmonitorSourceSection } from './spritmonitor-source';
import { FileText, Landmark, LineChart, Percent } from 'lucide-react';
import { Button } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { InflationReport } from '@budget/db';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { AppLink } from '../shell/app-link';
import { PayslipSourceSection } from '../reports/payslip-intake';
import { CryptoReadSourceSection } from './read-source';
import { SettingsSourceCard, sourceDate } from './settings-source-card';
import type { BankSourceStatus } from './data-sources';
import type { ReactNode } from 'react';

type PayslipStatus = {
  dropboxConfigured: boolean;
  dropboxConnected: boolean;
  lastScanAt: string | null;
  filesFound: number;
  errors: number;
};
type MarketStatus = {
  lastRun: { status: string; finishedAt: string | null; error?: string | null } | null;
  lastSuccess: { finishedAt: string | null } | null;
};

export function SettingsConnections({ bankConfiguration }: { bankConfiguration: ReactNode }) {
  const bank = useQuery({
    queryKey: ['bank-sync'],
    queryFn: () => request<BankSourceStatus>('GET', '/api/bank-sync'),
    refetchInterval: 30_000,
  });
  const payslip = useQuery({
    queryKey: ['payslip-source'],
    queryFn: () => request<PayslipStatus>('GET', '/api/payslip-intake/status'),
  });
  const market = useQuery({
    queryKey: ['market-status'],
    queryFn: () => request<MarketStatus>('GET', '/api/market/status'),
  });
  const cpi = useQuery({
    queryKey: [...LEDGER_KEY, 'personal-inflation'],
    retry: false,
    queryFn: () => request<InflationReport>('GET', '/api/reports/spending/inflation'),
  });
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      await request('POST', '/api/market/refresh');
      await client.invalidateQueries();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  const connections = bank.data?.connections ?? [];
  const broken = connections.some(
    (c) =>
      c.status !== 'active' ||
      c.accounts.some((a) => !a.accountId || (a.warnings?.length ?? 0) > 0),
  );
  const lastBankSuccess = connections
    .map((c) => c.lastSuccessAt)
    .filter((date): date is string => !!date)
    .sort()
    .at(-1);
  const nextBank = connections
    .filter((c) => c.status === 'active' && bank.data?.workerEnabled !== false)
    .map((c) =>
      c.manualAvailableAt && c.manualAvailableAt > c.nextRunAt ? c.manualAvailableAt : c.nextRunAt,
    )
    .sort()[0];
  const bankState = !bank.data?.configured
    ? 'Nicht eingerichtet'
    : bank.data.workerEnabled === false
      ? 'Pausiert'
      : connections.length === 0
        ? 'Nicht verbunden'
        : connections.some((connection) => connection.status === 'expired')
          ? 'Einwilligung abgelaufen'
          : connections.some((connection) => ['failed', 'error'].includes(connection.status))
            ? 'Abruf fehlgeschlagen'
            : connections.some((connection) => connection.status === 'paused')
              ? 'Pausiert'
              : connections.some((connection) => connection.status === 'pending')
                ? 'Freigabe offen'
                : connections.some((connection) =>
                      connection.accounts.some((account) => !account.accountId),
                    )
                  ? 'Konto zuordnen'
                  : connections.some((connection) => connection.running)
                    ? 'Abruf läuft'
                    : broken
                      ? 'Teilweise synchronisiert'
                      : 'Verbunden';

  return (
    <div className="data-sources settings-connections-v2">
      <div className="settings-primary-head">
        <h2>Verbindungen</h2>
      </div>
      <SettingsSourceCard
        title="Bank"
        icon={Landmark}
        status={bankState}
        attention={broken || !bank.data?.configured || bank.data?.workerEnabled === false}
        loading={bank.isPending}
        error={bank.isError}
        onRetry={() => void bank.refetch()}
        date={bank.data ? (lastBankSuccess ?? null) : undefined}
        next={nextBank ? sourceDate(nextBank) : undefined}
        initiallyOpen={
          new URLSearchParams(window.location.search).has('code') ||
          new URLSearchParams(window.location.search).has('error')
        }
        detail={
          connections.length
            ? connections
                .map(
                  (c) =>
                    `${c.label}: ${c.accounts.length} Konten · ${c.accounts.reduce((sum, account) => sum + account.open, 0)} zu prüfen`,
                )
                .join(' · ')
            : 'PSD2 · Bankkonten und Umsätze'
        }
      >
        {connections.map((c) => (
          <p key={c.id}>
            <strong>{c.label}</strong> ·{' '}
            {c.status === 'expired'
              ? 'Einwilligung abgelaufen – Bank neu verbinden.'
              : c.status === 'paused'
                ? 'Verbindung pausiert – Bank neu verbinden.'
                : c.status === 'pending'
                  ? 'Bankfreigabe abschließen.'
                  : c.status === 'active'
                    ? 'Verbunden'
                    : 'Abruf fehlgeschlagen – Verbindung und Freigabe prüfen.'}{' '}
            · Letzter Erfolg: {sourceDate(c.lastSuccessAt)}
            {c.accounts.some((a) => !a.accountId) && ' · Konto zuordnen erforderlich.'}
          </p>
        ))}
        {bankConfiguration}
      </SettingsSourceCard>
      <CryptoReadSourceSection compact />
      <SpritmonitorSourceSection compact />
      <SettingsSourceCard
        title="Gehaltszettel"
        icon={FileText}
        status={
          !payslip.data?.dropboxConfigured
            ? 'Upload verfügbar'
            : payslip.data.dropboxConnected
              ? 'Verbunden'
              : 'Wartet auf Scan'
        }
        attention={!!payslip.data?.errors}
        detail={
          payslip.data
            ? `PDF-Import · ${payslip.data.filesFound} Dateien · ${payslip.data.errors} Fehler / Warnungen`
            : 'PDF-Import · Dropbox'
        }
        date={payslip.data?.lastScanAt}
        loading={payslip.isPending}
        error={payslip.isError}
        onRetry={() => void payslip.refetch()}
        action={
          <AppLink
            className="btn btn-ghost"
            to="/konten/pruefen"
            search={{ teil: 'aufgaben', von: '/einstellungen/datenquellen' }}
          >
            Dokumente prüfen
          </AppLink>
        }
      >
        <PayslipSourceSection />
      </SettingsSourceCard>
      <SettingsSourceCard
        title="Kurse"
        icon={LineChart}
        status={
          market.data?.lastRun?.status === 'ok'
            ? 'Abruf erfolgreich'
            : market.data?.lastRun
              ? 'Bitte prüfen'
              : 'Noch nicht abgerufen'
        }
        attention={market.data?.lastRun?.status !== 'ok'}
        detail="Wertpapierkurse, Wechselkurse und öffentliche Statistik"
        date={market.data ? (market.data.lastSuccess?.finishedAt ?? null) : undefined}
        loading={market.isPending}
        error={market.isError}
        onRetry={() => void market.refetch()}
        action={
          <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Ruft ab …' : 'Jetzt abrufen'}
          </Button>
        }
      >
        <p>
          Letzter Lauf: {sourceDate(market.data?.lastRun?.finishedAt)} · Status:{' '}
          {market.data?.lastRun?.status ?? 'Noch kein Lauf'}
        </p>
        <p>
          Kurse mit Lücken bleiben als unvollständig erkennbar. Der Abruf verwendet die vorhandenen
          Quellen.
        </p>
      </SettingsSourceCard>
      <SettingsSourceCard
        title="VPI"
        icon={Percent}
        status={cpi.data?.reference ? 'Referenz verfügbar' : 'Keine Referenz verfügbar'}
        attention={!cpi.data?.reference}
        detail={
          cpi.data?.reference
            ? `Statistik Austria · letzter Monat ${cpi.data.reference.lastMonth}`
            : 'Statistik Austria · Verbraucherpreisindex'
        }
        date={cpi.data ? (cpi.data.reference?.fetchedAt ?? null) : undefined}
        loading={cpi.isPending}
        error={cpi.isError}
        onRetry={() => void cpi.refetch()}
        action={
          <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Ruft ab …' : 'Jetzt abrufen'}
          </Button>
        }
      >
        <p>Öffentliche Statistik wird mit dem vorhandenen Marktdaten-Abruf aktualisiert.</p>
        <AppLink className="btn btn-ghost" to="/reports/inflation">
          Zur persönlichen Inflation
        </AppLink>
      </SettingsSourceCard>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
