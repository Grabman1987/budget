import './portfolio-performance-report.css';
import { useState } from 'react';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAssetWrite } from './asset-classes-api';
import { request } from '../api/http';

interface Selection {
  instruments: { id: string; name: string; isin: string }[];
  ids: string[];
}
const PATH = '/api/portfolio/benchmarks';
const KEY = ['portfolio-benchmarks'] as const;

/** The same persisted checkboxes in reports and settings. */
export function BenchmarkChoices() {
  const client = useQueryClient();
  const write = useAssetWrite();
  const [draft, setDraft] = useState<string[] | null>(null);
  const query = useQuery({ queryKey: KEY, queryFn: () => request<Selection>('GET', PATH) });
  const save = useMutation({
    mutationFn: async (ids: string[]) => {
      let saved: Selection | undefined;
      await write(async () => {
        const result = await request<Selection & { groupId: string }>('PATCH', PATH, { ids });
        saved = result;
        return result;
      }, 'Benchmarks gespeichert.');
      return saved!;
    },
    onError: () => setDraft(null),
    onSuccess: (saved) => {
      client.setQueryData(KEY, saved);
      setDraft(null);
    },
  });
  const ids = draft ?? query.data?.ids ?? [];
  return (
    <fieldset className="benchmark-choices" disabled={save.isPending}>
      <legend>Vergleich · Start = 100</legend>
      {query.isPending && <p role="status">Lädt …</p>}
      {query.data?.instruments.map((b) => (
        <label key={b.id}>
          <input
            type="checkbox"
            checked={ids.includes(b.id)}
            onChange={(e) => {
              const next = e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id);
              setDraft(next);
              save.mutate(next);
            }}
          />
          {b.name}
        </label>
      ))}
      {(query.isError || save.isError) && (
        <p role="alert">
          Die Auswahl konnte nicht geladen oder gespeichert werden.{' '}
          <Button
            variant="ghost"
            onClick={() => {
              save.reset();
              void query.refetch();
            }}
          >
            Erneut laden
          </Button>
        </p>
      )}
    </fieldset>
  );
}

export function PortfolioBenchmarkSettings() {
  useAmountPrivacy();
  return (
    <section className="investment-settings" aria-labelledby="benchmark-settings-title">
      <h2 id="benchmark-settings-title">Benchmarks für Rendite und Kennzahlen</h2>
      <BenchmarkChoices />
      <p className="vnote">
        EUR-Kurse von Index-ETF; Kurslücken bleiben sichtbar. Die Auswahl gilt in allen
        Portfolio-Reports.
      </p>
    </section>
  );
}
