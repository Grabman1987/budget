import { Button, Field, SectionHead, Select, useToast, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { undoGroup } from '../ledger/api';

const PATH = '/api/portfolio/benchmark';
const KEY = ['portfolio-benchmark'] as const;
interface Benchmark {
  securityId: string | null;
  name: string | null;
  available: boolean;
  groupId?: string;
}

export function PortfolioBenchmarkSettings() {
  useAmountPrivacy();
  const client = useQueryClient(),
    toast = useToast();
  const query = useQuery({ queryKey: KEY, queryFn: () => request<Benchmark>('GET', PATH) });
  const securities = useQuery({
    queryKey: ['benchmark-securities'],
    queryFn: () =>
      request<{ securities: { id: string; name: string }[] }>('GET', '/api/securities'),
  });
  const [chosen, setChosen] = useState<string>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const value = chosen ?? query.data?.securityId ?? '';
  const replay = (groupId: string, redo = false) => {
    setBusy(true);
    void undoGroup(groupId)
      .then(
        async (result) => {
          setChosen(undefined);
          await client.invalidateQueries();
          toast.show({
            message: redo ? 'Benchmark wiederhergestellt.' : 'Benchmark rückgängig gemacht.',
            actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
            onAction: () => replay(result.groupId, !redo),
          });
        },
        () => setError('Die Änderung konnte nicht rückgängig gemacht werden.'),
      )
      .finally(() => setBusy(false));
  };
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const saved = await request<Benchmark>('PATCH', PATH, { securityId: value || null });
      client.setQueryData(KEY, saved);
      setChosen(undefined);
      await client.invalidateQueries();
      toast.show({
        message: 'Benchmark gespeichert.',
        actionLabel: 'Rückgängig',
        onAction: () => {
          if (saved.groupId) replay(saved.groupId);
        },
      });
    } catch {
      setError('Die Benchmark konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="investment-settings" aria-labelledby="benchmark-settings-title">
      <SectionHead id="benchmark-settings-title" title="Benchmark für Rendite und Kennzahlen" />
      <p>
        Ein vorhandenes Wertpapier dient als Vergleich im Report. Es braucht keinen gehaltenen
        Bestand. Fehlende gespeicherte Kurse bleiben Lücken.
      </p>
      {(query.isPending || securities.isPending) && <p role="status">Lädt …</p>}
      {(query.isError || securities.isError) && (
        <p role="alert">
          Die Benchmark-Auswahl konnte nicht geladen werden.{' '}
          <Button
            variant="ghost"
            onClick={() => {
              void query.refetch();
              void securities.refetch();
            }}
          >
            Erneut laden
          </Button>
        </p>
      )}
      {!query.isError && !securities.isError && query.data && securities.data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field
            label="Benchmark-Wertpapier"
            hint="Verglichen wird die gespeicherte Kursentwicklung im selben Zeitraum, ohne zusätzliche Ausschüttungen."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={value}
                disabled={busy}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">Keine Benchmark</option>
                {query.data.securityId && !query.data.available && (
                  <option value={query.data.securityId}>
                    Gespeichertes Wertpapier nicht verfügbar
                  </option>
                )}
                {securities.data!.securities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy || value === (query.data.securityId ?? '')}>
            {busy ? 'Speichert …' : 'Benchmark speichern'}
          </Button>
        </form>
      )}
    </section>
  );
}
