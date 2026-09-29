import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

interface Health {
  status: string;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch('/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return (await res.json()) as Health;
}

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  const status = health.isPending ? 'prüfe …' : health.isError ? 'nicht erreichbar' : 'erreichbar';
  return (
    <main className="home">
      <h1 className="home-title t-dimension">Budget</h1>
      <p className="home-status tech" data-testid="server-status">
        Server: {status}
      </p>
      <p>
        <Link to="/dev/bauteile">Bauteile</Link> · <Link to="/dev/diagramme">Diagramm-Spike</Link>
      </p>
    </main>
  );
}
