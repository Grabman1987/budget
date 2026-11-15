import { Field, Select } from '@budget/ui';
import {
  describeFamilyContext,
  FAMILY_OPTIONS,
  PROFILE_DEPENDANTS_MAX,
  type FamilyChoiceKey,
  type FamilyContext,
  type FamilySituation,
} from '@budget/domain';

interface ChoiceText {
  label: string;
  hint: string;
  options: Record<string, string>;
}

const CHOICES: Record<FamilyChoiceKey, ChoiceText> = {
  partnership: {
    label: 'Partnerschaft',
    hint: 'Lebst du in einer Partnerschaft? Die Haushaltsgröße steht oben und wird nicht doppelt erfasst.',
    options: { none: 'Keine Partnerin / kein Partner', partner: 'Partnerin / Partner' },
  },
  partnerIncome: {
    label: 'Einkommen der Partnerschaft',
    hint: 'Wie viel des Haushaltseinkommens trägt die Partnerin / der Partner?',
    options: {
      none: 'Kein eigenes Einkommen',
      partial: 'Trägt einen Teil bei',
      full: 'Trägt etwa gleich viel oder mehr bei',
    },
  },
  support: {
    label: 'Laufende Unterstützungszahlungen',
    hint: 'Zahlst du regelmäßig Unterhalt oder Unterstützung an Personen außerhalb deines Haushalts? Beträge stehen in deinen Zahlungen und Budgets.',
    options: { none: 'Nein', some: 'Ja' },
  },
};

const COUNT_LABEL = {
  dependants: {
    label: 'Finanziell abhängige Personen',
    hint: 'Personen, für deren Lebensunterhalt du wesentlich aufkommst, Kinder eingeschlossen.',
  },
  children: {
    label: 'Davon Kinder',
    hint: 'Nur Kinder, die finanziell von dir abhängen.',
  },
};

const countOptions = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);

function Explanation({ context }: { context: FamilyContext }) {
  const lines: string[] = [];
  if (context.dependants === 'present')
    lines.push('Abhängige Personen können den Bedarf an verfügbarem Geld erhöhen.');
  if (context.support === 'present')
    lines.push('Laufende Unterstützungszahlungen binden einen Teil deines Einkommens.');
  if (context.incomeSharing === 'sole')
    lines.push('Das Haushaltseinkommen hängt allein von dir ab.');
  const text =
    context.consideration === 'review'
      ? `${lines.join(' ')} Das kann für deine Rücklage und die Risikotragfähigkeit relevant sein. Es ist ein Hinweis, keine Empfehlung.`
      : context.consideration === 'nothing'
        ? 'Nach deinen Angaben gibt es keine zusätzlichen Verpflichtungen, die den Bedarf an verfügbarem Geld erhöhen.'
        : 'Ohne vollständige Angaben wird nichts angenommen.';
  return (
    <div className="risk-result" data-level={context.consideration === 'unknown' ? 'unknown' : ''}>
      <strong>Bezug zu Rücklage und Risikotragfähigkeit</strong>
      <p>{text}</p>
      <p className="risk-basis">
        Der Familienstand allein ändert keine Rücklage, kein Ziel und keine Bewertung.
        Bewertungsmethode Version {context.version}.
      </p>
    </div>
  );
}

/** Voluntary family situation (all answers optional) and its neutral explanation. */
export function FamilySituationSection({
  family,
  disabled,
  onChange,
}: {
  family: FamilySituation;
  disabled: boolean;
  onChange: (patch: Partial<FamilySituation>) => void;
}) {
  const context = describeFamilyContext(family);
  const choice = (key: FamilyChoiceKey) => (
    <Field key={key} label={CHOICES[key].label} hint={CHOICES[key].hint}>
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={family[key] ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? null : e.target.value;
            onChange({
              [key]: value,
              ...(key === 'partnership' && value !== 'partner' ? { partnerIncome: null } : {}),
            } as Partial<FamilySituation>);
          }}
        >
          <option value="">Keine Angabe</option>
          {FAMILY_OPTIONS[key].map((option) => (
            <option key={option} value={option}>
              {CHOICES[key].options[option]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  const count = (key: 'dependants' | 'children') => {
    const max =
      key === 'children' && family.dependants !== null ? family.dependants : PROFILE_DEPENDANTS_MAX;
    return (
      <Field key={key} label={COUNT_LABEL[key].label} hint={COUNT_LABEL[key].hint}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={family[key] === null ? '' : String(family[key])}
            onChange={(e) => {
              const value = e.target.value === '' ? null : Number(e.target.value);
              const dropChildren =
                key === 'dependants' &&
                value !== null &&
                family.children !== null &&
                family.children > value;
              onChange({ [key]: value, ...(dropChildren ? { children: null } : {}) });
            }}
          >
            <option value="">Keine Angabe</option>
            {countOptions(max).map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Keine' : n}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  };
  return (
    <fieldset className="risk-profile family-situation" disabled={disabled}>
      <legend>Familie und Verpflichtungen (freiwillig)</legend>
      <p className="profile-purpose">
        Diese Angaben helfen zu erklären, wie viel Rücklage und Verlustrisiko für dich tragbar sind.
        Es werden keine Namen oder Geburtsdaten anderer Personen gespeichert. Unbekannt,
        ausdrücklich keine und 0 bleiben unterschieden. Zielverteilungen, Rücklagen und Buchungen
        ändern sich dadurch nicht.
      </p>
      <div className="profile-grid">
        {choice('partnership')}
        {family.partnership === 'partner' && choice('partnerIncome')}
        {count('dependants')}
        {count('children')}
        {choice('support')}
      </div>
      <div className="risk-results" role="status" aria-live="polite">
        <Explanation context={context} />
      </div>
    </fieldset>
  );
}
