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
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { RELOCATED_PAGES } from '../settings/navigation';
import { useUnsavedSettings } from '../settings/use-unsaved-settings';
import { PageFrame } from './placeholder-page';
import './investment-settings.css';
import { PortfolioBenchmarkSettings } from './portfolio-benchmark-settings';

type CostMethod = 'average' | 'fifo';
interface Preferences {
  costMethod: CostMethod;
}
const PATH = '/api/portfolio/preferences';
const KEY = ['investment-preferences'] as const;

export function InvestmentSettingsPage() {
  useAmountPrivacy();
  return (
    <PageFrame meta={RELOCATED_PAGES.investment} title="Portfolio-Auswertung" revealCurrentRegister>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const method = chosen ?? query.data?.costMethod ?? 'average';
  useUnsavedSettings(chosen !== undefined && chosen !== query.data?.costMethod, busy);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const saved = await request<Preferences & { groupId: string }>('PATCH', PATH, { costMethod: method });
      client.setQueryData(KEY, saved);
      setChosen(undefined);
      await client.invalidateQueries();
      toast.show({
        message: 'Einstandskostenmethode gespeichert.', actionLabel: 'Rückgängig',
        onAction: () => void undoGroup(saved.groupId)
          .then(() => client.invalidateQueries())
          .catch((error: unknown) => toast.show({ message: errorText(error) })),
      });
    } catch {
      setError('Die Einstellung konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="investment-settings" aria-labelledby="investment-method-title">
      <SectionHead id="investment-method-title" title="Einstandskosten" />
      <p>
        Die Methode gilt für alle Depots und Krypto-Konten. Sie bestimmt den Einstand und die
        Verkaufsgewinne je Wertpapier oder Kryptowährung innerhalb eines Kontos.
      </p>
      {query.isPending && <p role="status">Lädt …</p>}
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
                onChange={(event) => setChosen(event.target.value as CostMethod)}
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
          <Button type="submit" disabled={busy || method === query.data.costMethod}>
            {busy ? 'Speichert …' : 'Speichern'}
          </Button>
        </form>
      )}
    </section>
  );
}
