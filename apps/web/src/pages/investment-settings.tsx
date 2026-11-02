import {
  Button,
  Field,
  SectionHead,
  Select,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { INVESTMENT_SETTINGS_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import './investment-settings.css';
import { PortfolioBenchmarkSettings } from './portfolio-benchmark-settings';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { SettingsDraftGuard } from './settings-draft-guard';

type CostMethod = 'average' | 'fifo';
interface Preferences {
  costMethod: CostMethod;
}
const PATH = '/api/portfolio/preferences';
const KEY = ['investment-preferences'] as const;

export function InvestmentSettingsPage() {
  useAmountPrivacy();
  return (
    <PageFrame meta={INVESTMENT_SETTINGS_META} revealCurrentRegister>
      <InvestmentSettingsPanel />
      <PortfolioBenchmarkSettings />
    </PageFrame>
  );
}

/** Stored acquisition method; changing it recalculates figures without changing trade records. */
export function InvestmentSettingsPanel() {
  useAmountPrivacy();
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: KEY, queryFn: () => request<Preferences>('GET', PATH) });
  const [chosen, setChosen] = useState<CostMethod>();
  const [source, setSource] = useState<CostMethod>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const method = chosen ?? query.data?.costMethod ?? 'average';
  const dirty = chosen !== undefined && chosen !== source;
  const stale = REDESIGN_ENABLED && source !== undefined && source !== query.data?.costMethod;

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (REDESIGN_ENABLED) {
        const latest = await request<Preferences>('GET', PATH);
        if (latest.costMethod !== source) {
          client.setQueryData(KEY, latest);
          setError(
            'Die Einstellung wurde inzwischen geändert. Dein Entwurf bleibt erhalten. Lade den aktuellen Stand.',
          );
          return;
        }
      }
      const saved = await request<Preferences>('PATCH', PATH, { costMethod: method });
      client.setQueryData(KEY, saved);
      setChosen(undefined);
      setSource(undefined);
      await client.invalidateQueries();
      toast.show({ message: 'Einstandskostenmethode gespeichert.' });
    } catch {
      setError('Die Einstellung konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  if (REDESIGN_ENABLED)
    return (
      <section className="settings-investment-v2" aria-labelledby="investment-method-title">
        <div className="settings-primary-head">
          <h2 id="investment-method-title">Depots &amp; Kryptos</h2>
        </div>
        {query.isPending && <p role="status">Lädt …</p>}
        {query.isError && (
          <p role="alert">
            Die Einstellung konnte nicht geladen werden.{' '}
            <Button variant="ghost" onClick={() => void query.refetch()}>
              Erneut laden
            </Button>
          </p>
        )}
        {query.data && (
          <form
            className="settings-compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <SettingsDraftGuard dirty={dirty} busy={busy} />
            <div className="settings-form-row">
              <label htmlFor="settings-cost-method">Einstandskostenmethode</label>
              <Select
                id="settings-cost-method"
                value={method}
                disabled={busy}
                onChange={(event) => {
                  setSource((previous) => previous ?? query.data?.costMethod);
                  setChosen(event.target.value as CostMethod);
                }}
              >
                <option value="average">Durchschnittseinstand (Standard)</option>
                <option value="fifo">FIFO – älteste Kaufposten zuerst</option>
              </Select>
            </div>
            <p className="settings-source-stamp">Gilt für alle Depots und Krypto-Konten.</p>
            {stale && (
              <p role="alert">
                Die Einstellung wurde inzwischen geändert. Dein Entwurf bleibt erhalten.
              </p>
            )}
            {error && <p role="alert">{maskMoneyText(error)}</p>}
            <div className="settings-form-actions">
              <Button type="submit" disabled={busy || stale || method === query.data.costMethod}>
                {busy ? 'Speichert …' : 'Speichern'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy || (!dirty && !stale)}
                onClick={() => {
                  setChosen(undefined);
                  setSource(undefined);
                  setError(undefined);
                }}
              >
                {stale ? 'Aktuellen Stand laden' : 'Verwerfen'}
              </Button>
            </div>
          </form>
        )}
        <details className="settings-advanced">
          <summary>Einstand, Gebühren und Steuern</summary>
          <p>
            Durchschnittseinstand: Jeder Kauf aktualisiert den durchschnittlichen Einstand. FIFO:
            Bei Verkäufen werden die ältesten Kaufposten zuerst verwendet.
          </p>
          <p>
            Ein Methodenwechsel berechnet die vorhandene Historie neu. Käufe, Verkäufe und
            Bestandssnapshots bleiben erhalten. Belegte Verkaufsgewinne bleiben auch bei 0 Anteilen
            sichtbar.
          </p>
          <p>
            Erfasste Gebühren und abgeführte Steuern fließen in den Nettogewinn ein. Die App
            berechnet oder bucht keine zusätzliche Kapitalertragsteuer.
          </p>
        </details>
        {query.dataUpdatedAt > 0 && (
          <p className="settings-source-stamp">
            Einstellung geladen:{' '}
            {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(
              query.dataUpdatedAt,
            )}
          </p>
        )}
      </section>
    );

  return (
    <section className="investment-settings" aria-labelledby="investment-method-title">
      <SectionHead id="investment-method-title" title="Einstandskosten" />
      <p>
        Die Methode gilt für alle Depots und Krypto-Konten. Sie bestimmt den Einstand und die
        Verkaufsgewinne je Wertpapier oder Kryptowährung innerhalb eines Kontos.
      </p>
      {query.isPending && <p role="status">Lädt …</p>}
      {REDESIGN_ENABLED && query.dataUpdatedAt > 0 && (
        <p className="text-muted">
          Einstellung geladen:{' '}
          {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(
            query.dataUpdatedAt,
          )}
        </p>
      )}
      {query.isError && (
        <p className="field-error" role="alert">
          Die Einstellung konnte nicht geladen werden.
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
      {query.data && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {REDESIGN_ENABLED && <SettingsDraftGuard dirty={dirty} busy={busy} />}
          {stale && (
            <p role="alert">
              Die Einstellung wurde inzwischen geändert. Dein Entwurf wurde nicht übernommen.
            </p>
          )}
          <Field
            label="Einstandskostenmethode"
            hint={
              method === 'average'
                ? 'Gleitender Durchschnitt: Jeder Kauf aktualisiert den durchschnittlichen Einstand der gehaltenen Anteile.'
                : 'FIFO: Bei einem Verkauf werden die ältesten gehaltenen Kaufposten zuerst verwendet.'
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={method}
                disabled={busy}
                onChange={(event) => {
                  setSource((previous) => previous ?? query.data?.costMethod);
                  setChosen(event.target.value as CostMethod);
                }}
              >
                <option value="average">Durchschnittseinstand (Standard)</option>
                <option value="fifo">FIFO – älteste Kaufposten zuerst</option>
              </Select>
            )}
          </Field>
          <p className="text-muted">
            Ein Methodenwechsel berechnet die vorhandene Historie neu. Käufe, Verkäufe und
            Bestandssnapshots bleiben erhalten. Belegte Verkaufsgewinne bleiben auch bei 0 Anteilen
            sichtbar.
          </p>
          <p className="text-muted">
            Beim Kauf oder Verkauf erfasste Gebühren und abgeführte Steuern fließen in den
            Nettogewinn ein. Die App berechnet oder bucht keine zusätzliche Kapitalertragsteuer.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {maskMoneyText(error)}
            </p>
          )}
          <Button type="submit" disabled={busy || stale || method === query.data.costMethod}>
            {busy ? 'Speichert …' : 'Speichern'}
          </Button>
          {REDESIGN_ENABLED && (
            <Button
              variant="ghost"
              disabled={busy || (!dirty && !stale)}
              onClick={() => {
                setChosen(undefined);
                setSource(undefined);
                setError(undefined);
              }}
            >
              {stale ? 'Aktuellen Stand laden' : 'Verwerfen'}
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
