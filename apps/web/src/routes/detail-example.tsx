import { TitleBlock } from '@budget/ui';
import { useSearch } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';

export function DetailExamplePage() {
  const { titel, lang, von } = useSearch({ strict: false }) as {
    titel?: string;
    lang?: boolean;
    von?: string;
  };
  const back = von === 'panels' ? '/dev/panels' : '/dev/bauteile';
  const title = titel ?? 'Details';
  return (
    <main className="dev">
      <TitleBlock title={title} />
      <nav aria-label="Brotkrumen">
        <AppLink className="btn btn-ghost" to={back} search={{}}>
          {von === 'panels' ? 'Dialog-Prüfstand' : 'Bauteile'}
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <p>
        <AppLink className="btn btn-ghost" to={back} search={{}}>
          Zurück {von === 'panels' ? 'zum Prüfstand' : 'zu Bauteile'}
        </AppLink>
      </p>
      <h2>Einzelposten</h2>
      <p>Einzelposten von „{title}“ erscheinen auf dieser Unterseite.</p>
      {lang &&
        Array.from({ length: 40 }, (_, i) => <p key={i}>Zeile {i + 1} des langen Inhalts</p>)}
    </main>
  );
}
