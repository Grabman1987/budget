export function ReadSourceSummaries({
  summaries,
}: {
  summaries: { sourceId: string | null; name: string; count: number }[];
}) {
  if (!summaries.length) return null;
  return (
    <ul className="inbox-source-summaries" aria-label="Bewegungen in Datenquellen">
      {summaries.map((source) => (
        <li key={source.sourceId}>
          <a
            href={`/einstellungen/datenquellen${source.sourceId === 'crypto' ? '#crypto-source-title' : ''}`}
          >
            {source.name}: {source.count} Bewegungen zu prüfen
          </a>
        </li>
      ))}
    </ul>
  );
}
