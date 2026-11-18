import { useSpritmonitorSource } from './spritmonitor-source';
import { FileText, Landmark, LineChart, Percent } from 'lucide-react';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { InflationReport } from '@budget/db';
import { request } from '../api/http';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { AppLink } from '../shell/app-link';
import { PayslipSourceSection } from '../reports/payslip-intake';
import { useCryptoSource } from './read-source';
import {
  SourceRegister,
  sourceDate,
  registerDate,
  sourceReadState,
  type SourceRow,
  type SourceState,
} from './settings-source-card';
import type { BankSourceStatus } from './data-sources';
import type { ReactNode } from 'react';

type PayslipStatus = {
  dropboxConfigured: boolean;
  dropboxConnected: boolean;
  lastScanAt: string | null;
  filesFound: number;
  errors: number;
  errorCode?: string | null;
};
type MarketStatus = {
  lastRun: { status: string; finishedAt: string | null; error?: string | null } | null;
  lastSuccess: { finishedAt: string | null } | null;
};

export function SettingsConnections({ bankConfiguration }: { bankConfiguration: ReactNode }) {
  useAmountPrivacy();
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
    queryKey: [...LEDGER_KEY, 'inflation-reference'],
    retry: false,
    queryFn: () =>
      request<Pick<InflationReport, 'reference'>>('GET', '/api/inflation-basket/reference'),
  });
  const { row: crypto } = useCryptoSource(true);
  const { row: spritmonitor } = useSpritmonitorSource(true);
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
  const accounts = connections.flatMap((connection) => connection.accounts);
  const unmapped = accounts.find((account) => !account.accountId);
  const hasFailed = (connection: (typeof connections)[number]) =>
    !['active', 'expired', 'pending', 'paused'].includes(connection.status);
  const partialRuns = new Map(
    connections.flatMap((connection) => {
      if (connection.status !== 'error' || !connection.lastAttemptAt) return [];
      const mapped = connection.accounts.filter(({ accountId, fromDate }) => accountId && fromDate);
      const { lastAttemptAt } = connection;
      const missing = mapped.filter(({ lastSyncAt }) => !lastSyncAt || lastSyncAt < lastAttemptAt);
      // Account commits survive a failed run. Only call it partial with evidence from this attempt.
      return missing.length > 0 && missing.length < mapped.length
        ? [[connection, missing] as const]
        : [];
    }),
  );
  const failed = connections.find(
    (connection) => hasFailed(connection) && !partialRuns.has(connection),
  );
  const partial = [...partialRuns.keys()][0];
  const expired = connections.find((connection) => connection.status === 'expired');
  const pending = connections.find((connection) => connection.status === 'pending');
  const active = connections.find(
    (connection) => connection.status === 'active' && !connection.manualBlockedReason,
  );
  const paused =
    bank.data?.workerEnabled === false ||
    connections.some((connection) => connection.status === 'paused');
  const warning = accounts.find((account) => account.warnings?.length);
  const open = accounts.reduce((sum, account) => sum + account.open, 0);
  const lastBankSuccess = connections
    .flatMap((connection) => (connection.lastSuccessAt ? [connection.lastSuccessAt] : []))
    .sort()
    .at(-1);
  const bankState: SourceState = failed
    ? 'failed'
    : expired
      ? 'expired'
      : unmapped
        ? 'unmapped'
        : partial || warning
          ? 'partial'
          : pending
            ? 'pending'
            : paused
              ? 'paused'
              : !connections.length || !bank.data?.configured
                ? 'unconfigured'
                : connections.some((connection) => connection.running)
                  ? 'running'
                  : lastBankSuccess
                    ? 'connected'
                    : 'waiting';
  const pendingAccounts = partial ? (partialRuns.get(partial) ?? []) : [];
  const reviewCount = open
    ? `${open} ${open === 1 ? 'Umsatz ist' : 'Umsätze sind'} zu prüfen.`
    : undefined;
  const bankImpacts: Partial<Record<SourceState, string | undefined>> = {
    failed: 'Der Stand der Bankkonten kann veraltet sein.',
    expired: 'Konten mit abgelaufener Einwilligung werden nicht abgerufen.',
    unmapped: unmapped
      ? `${maskMoneyText(unmapped.label)} wird ohne Zuordnung nicht abgerufen.`
      : undefined,
    partial: pendingAccounts.length
      ? `Für ${pendingAccounts.length} ${pendingAccounts.length === 1 ? 'Konto fehlt' : 'Konten fehlt'} der letzte Abruf.`
      : (reviewCount ?? 'Ein Teil der Kontodaten fehlt.'),
    pending: 'Die Bank wartet auf deine Freigabe.',
    paused: 'Der Abruf für betroffene Konten ist pausiert.',
    unconfigured: 'Bankkonten werden noch nicht abgerufen.',
    waiting: 'Für die Bankkonten steht der erste Abruf aus.',
    connected: reviewCount,
  };
  const bankParams = new URLSearchParams(window.location.search);
  const connectControl = '[data-source-bank-connect]:enabled';
  const syncControl = (connection: NonNullable<typeof active>) =>
    `[data-source-bank-sync="${encodeURIComponent(connection.id)}"]:enabled`;
  const retryTarget = (connection: NonNullable<typeof failed>) =>
    bank.data?.workerEnabled === false || connection.manualAvailableAt || connection.running
      ? `[data-source-bank-blocked="${encodeURIComponent(connection.id)}"]`
      : !connection.manualBlockedReason
        ? syncControl(connection)
        : connectControl;
  const fetchAction = active
    ? { label: 'Jetzt abrufen', target: syncControl(active) }
    : { label: 'Abruf ansehen' };
  const bankActions: Partial<Record<SourceState, SourceRow['detailAction']>> = {
    failed: {
      label: 'Erneut versuchen',
      target: failed && retryTarget(failed),
    },
    expired: { label: 'Bank neu verbinden', target: connectControl },
    unmapped: {
      label: 'Konto zuordnen',
      target: unmapped && `[data-source-bank-mapping="${encodeURIComponent(unmapped.id)}"]:enabled`,
    },
    partial: partial
      ? { label: 'Abruf fortsetzen', target: retryTarget(partial) }
      : {
          label: 'Konten prüfen',
          target: warning && `[data-source-bank-review="${encodeURIComponent(warning.id)}"]`,
        },
    pending: {
      label: 'Freigabe abschließen',
      target: `[data-source-bank-callback]:enabled, ${connectControl}`,
    },
    paused:
      bank.data?.workerEnabled === false
        ? { label: 'Einrichtung ansehen' }
        : { label: 'Bank neu verbinden', target: connectControl },
    unconfigured: bank.data?.configured
      ? { label: 'Bank verbinden', target: connectControl }
      : { label: 'Einrichtung ansehen' },
    connected: fetchAction,
    waiting: fetchAction,
  };
  const nextBank = connections
    .filter(
      (connection) =>
        bank.data?.workerEnabled !== false &&
        ['active', 'error'].includes(connection.status) &&
        connection.accounts.some((account) => account.accountId && account.fromDate),
    )
    .map((connection) => connection.nextRunAt)
    .filter(Boolean)
    .sort()[0];
  const payslipStatus = payslip.data;
  const payslipFailed = Boolean(
    payslipStatus?.errorCode && payslipStatus.errorCode !== 'document_warning',
  );
  const payslipState: SourceState = !payslipStatus?.dropboxConfigured
    ? 'unconfigured'
    : payslipFailed
      ? 'failed'
      : payslipStatus.errors
        ? 'partial'
        : payslipStatus.dropboxConnected
          ? 'connected'
          : 'waiting';
  const payslipImpacts: Partial<Record<SourceState, string | undefined>> = {
    unconfigured: 'PDFs lassen sich weiterhin hochladen.',
    failed: 'Neue PDFs aus Dropbox fehlen.',
    partial: 'Einige PDFs aus Dropbox brauchen eine Prüfung.',
    waiting: 'Der erste Abruf aus Dropbox steht noch aus.',
  };
  const marketRun = market.data?.lastRun?.status;
  const marketState =
    marketRun === 'ok'
      ? 'connected'
      : marketRun === 'partial'
        ? 'partial'
        : marketRun
          ? 'failed'
          : 'waiting';
  const marketAction = (label: string) => (
    <Button variant="ghost" disabled={busy} aria-busy={busy} onClick={() => void refresh()}>
      {busy ? 'Ruft ab …' : label}
    </Button>
  );
  const documents = (
    <AppLink
      className="btn btn-ghost"
      to="/konten/pruefen"
      search={{ teil: 'aufgaben', von: '/einstellungen/datenquellen' }}
    >
      Dokumente prüfen
    </AppLink>
  );
  const sources: SourceRow[] = [
    sourceReadState(bank, {
      id: 'quelle-bank',
      title: 'Bank',
      icon: Landmark,
      state: bankState,
      scope: accounts.length
        ? `${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'} – PSD2`
        : 'Konten und Umsätze – PSD2',
      impact: bankImpacts[bankState],
      date: bank.data ? (lastBankSuccess ?? null) : undefined,
      next: nextBank,
      initiallyOpen: bankParams.has('code') || bankParams.has('error'),
      detailAction: bankActions[bankState],
      action:
        bankState === 'running' ? (
          <Button variant="ghost" disabled aria-busy="true">
            Ruft ab …
          </Button>
        ) : undefined,
      children: (
        <>
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
        </>
      ),
    }),
    crypto,
    spritmonitor,
    sourceReadState(payslip, {
      id: 'quelle-gehaltszettel',
      title: 'Gehaltszettel',
      icon: FileText,
      state: payslipState,
      scope: 'PDF aus Dropbox',
      impact: payslipImpacts[payslipState],
      // The adapter reports the latest attempt, not a separate successful scan timestamp.
      date:
        payslipStatus?.dropboxConnected && !payslipFailed
          ? payslipStatus.lastScanAt
          : payslipStatus && !payslipStatus.lastScanAt
            ? null
            : undefined,
      action: payslipFailed ? (
        <Button
          variant="ghost"
          disabled={payslip.isFetching}
          aria-busy={payslip.isFetching}
          onClick={() => void payslip.refetch()}
        >
          {payslip.isFetching ? 'Lädt …' : 'Erneut versuchen'}
        </Button>
      ) : (
        documents
      ),
      children: (
        <>
          <p>
            Letzter Scanversuch:{' '}
            {payslip.isPending
              ? 'Wird geladen …'
              : payslipStatus?.lastScanAt
                ? registerDate(payslipStatus.lastScanAt)
                : 'Noch kein Scanversuch'}
            {payslipFailed && ` · ${payslipStatus?.filesFound ?? 0} Dateien bis zum Fehler`}
          </p>
          {payslipFailed && documents}
          <PayslipSourceSection />
        </>
      ),
    }),
    sourceReadState(market, {
      id: 'quelle-kurse',
      title: 'Kurse',
      icon: LineChart,
      state: marketState,
      scope: 'Wertpapier- und Wechselkurse',
      impact:
        marketState === 'failed'
          ? 'Der Kursstand kann veraltet sein.'
          : marketState === 'partial'
            ? 'Einige Kurse konnten nicht abgerufen werden.'
            : marketState === 'waiting'
              ? 'Kurse wurden noch nicht abgerufen.'
              : undefined,
      date: market.data ? (market.data.lastSuccess?.finishedAt ?? null) : undefined,
      action: marketAction(
        marketState === 'failed' || marketState === 'partial'
          ? 'Erneut versuchen'
          : 'Jetzt abrufen',
      ),
      children: (
        <>
          <p>
            Letzter Lauf:{' '}
            {market.isPending ? 'Wird geladen …' : sourceDate(market.data?.lastRun?.finishedAt)} ·
            Status:{' '}
            {market.isPending
              ? 'Wird geladen …'
              : (market.data?.lastRun?.status ?? 'Noch kein Lauf')}
          </p>
          <p>
            Kurse mit Lücken bleiben als unvollständig erkennbar. Der Abruf verwendet die
            vorhandenen Quellen.
          </p>
        </>
      ),
    }),
    sourceReadState(cpi, {
      id: 'quelle-vpi',
      title: 'VPI',
      icon: Percent,
      scope: 'Verbraucherpreisindex',
      state: cpi.data?.reference ? 'connected' : 'waiting',
      impact: cpi.data?.reference ? undefined : 'Für den Index sind noch keine Werte verfügbar.',
      date: cpi.data ? (cpi.data.reference?.fetchedAt ?? null) : undefined,
      action: marketAction('Jetzt abrufen'),
      children: (
        <>
          <p>Öffentliche Statistik wird mit dem vorhandenen Marktdaten-Abruf aktualisiert.</p>
          <AppLink className="btn btn-ghost" to="/reports/inflation">
            Zur persönlichen Inflation
          </AppLink>
        </>
      ),
    }),
  ];

  return (
    <div className="data-sources settings-connections-v2">
      <div className="settings-primary-head">
        <h2>Verbindungen</h2>
      </div>
      <SourceRegister sources={sources} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
