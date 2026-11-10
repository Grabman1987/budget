import { Field, Select } from '@budget/ui';
import {
  classifyRiskProfile,
  RISK_QUESTION_KEYS,
  RISK_QUESTIONS,
  type RiskAnswers,
  type RiskDimension,
  type RiskLevel,
  type RiskQuestionKey,
} from '@budget/domain';

interface QuestionText {
  label: string;
  hint: string;
  options: Record<string, string>;
}

/** German question texts; the option order follows `RISK_QUESTIONS` (cautious first). */
const QUESTIONS: Record<RiskQuestionKey, QuestionText> = {
  horizon: {
    label: 'Anlagehorizont',
    hint: 'In wie vielen Jahren brauchst du das angelegte Geld voraussichtlich?',
    options: {
      lt3: 'Unter 3 Jahren',
      '3to7': '3 bis 7 Jahre',
      '7to15': '7 bis 15 Jahre',
      gt15: 'Mehr als 15 Jahre',
    },
  },
  liquidity: {
    label: 'Bedarf an verfügbarem Geld',
    hint: 'Könntest du in den nächsten 12 Monaten größere Teile der Geldanlagen brauchen?',
    options: {
      high: 'Ja, wahrscheinlich',
      some: 'Möglicherweise einen Teil',
      low: 'Nein, kaum',
    },
  },
  reserve: {
    label: 'Rücklage',
    hint: 'Wie viele Monatsausgaben hast du außerhalb der Geldanlagen als Rücklage?',
    options: { lt3: 'Weniger als 3', '3to6': '3 bis 6', gt6: 'Mehr als 6' },
  },
  income: {
    label: 'Stabilität des Einkommens',
    hint: 'Wie sicher ist dein Haushaltseinkommen in den nächsten Jahren?',
    options: {
      unstable: 'Schwankend oder unsicher',
      moderate: 'Überwiegend sicher',
      stable: 'Sehr sicher',
    },
  },
  lossReaction: {
    label: 'Reaktion auf Kursverluste',
    hint: 'Dein Depot verliert in kurzer Zeit 30 %. Was tust du?',
    options: {
      sellAll: 'Ich verkaufe alles',
      sellPart: 'Ich verkaufe einen Teil',
      hold: 'Ich halte und warte ab',
      buyMore: 'Ich kaufe zu',
    },
  },
  acceptableLoss: {
    label: 'Akzeptabler vorübergehender Verlust',
    hint: 'Welchen Wertrückgang der Geldanlagen würdest du zeitweise aushalten?',
    options: { p10: 'Bis 10 %', p20: 'Bis 20 %', p35: 'Bis 35 %', p50: 'Bis 50 % oder mehr' },
  },
};

const LEVEL_TEXT: Record<RiskLevel, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
  unknown: 'unbekannt',
};

const MEANING: Record<'tolerance' | 'capacity', Record<RiskLevel, string>> = {
  tolerance: {
    low: 'Du möchtest Wertschwankungen eher vermeiden.',
    medium: 'Du nimmst mäßige Wertschwankungen in Kauf.',
    high: 'Du nimmst auch deutliche Wertschwankungen in Kauf.',
    unknown: 'Ohne vollständige Antworten wird nichts angenommen.',
  },
  capacity: {
    low: 'Finanziell wäre ein größerer Verlust schwer zu tragen.',
    medium: 'Finanziell wäre ein mäßiger Verlust tragbar.',
    high: 'Finanziell wäre auch ein größerer Verlust tragbar.',
    unknown: 'Ohne vollständige Antworten wird nichts angenommen.',
  },
};

function basis(dimension: RiskDimension): string {
  if (dimension.level !== 'unknown')
    return `Grundlage: ${dimension.answered} von ${dimension.total} Fragen beantwortet.`;
  return `${dimension.answered} von ${dimension.total} Fragen beantwortet. Offen: ${dimension.missing
    .map((k) => QUESTIONS[k].label)
    .join(', ')}.`;
}

function Result({
  kind,
  title,
  dimension,
}: {
  kind: 'tolerance' | 'capacity';
  title: string;
  dimension: RiskDimension;
}) {
  return (
    <div className="risk-result" data-level={dimension.level}>
      <strong>
        {title}: {LEVEL_TEXT[dimension.level]}
      </strong>
      <p>{MEANING[kind][dimension.level]}</p>
      <p className="risk-basis">{basis(dimension)}</p>
    </div>
  );
}

/** Voluntary risk questionnaire (all answers optional) and its plain-language result. */
export function RiskProfileSection({
  answers,
  disabled,
  onChange,
}: {
  answers: RiskAnswers;
  disabled: boolean;
  onChange: (key: RiskQuestionKey, value: string) => void;
}) {
  const result = classifyRiskProfile(answers);
  return (
    <fieldset className="risk-profile" disabled={disabled}>
      <legend>Risikoprofil (freiwillig)</legend>
      <p className="profile-purpose">
        Zwei getrennte Fragen: Wie viel Schwankung willst du aushalten (Risikobereitschaft), und wie
        viel Verlust könntest du finanziell tragen (Risikotragfähigkeit)? Fehlende Antworten bleiben
        unbekannt. Alter und Haushaltsgröße fließen nicht ein, Zielverteilungen, Sparpläne und
        Buchungen ändern sich dadurch nicht.
      </p>
      <div className="profile-grid">
        {RISK_QUESTION_KEYS.map((key) => (
          <Field key={key} label={QUESTIONS[key].label} hint={QUESTIONS[key].hint}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={answers[key] ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">Keine Angabe</option>
                {RISK_QUESTIONS[key].options.map((option) => (
                  <option key={option} value={option}>
                    {QUESTIONS[key].options[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </div>
      <div className="risk-results" role="status" aria-live="polite">
        <Result kind="tolerance" title="Risikobereitschaft" dimension={result.tolerance} />
        <Result kind="capacity" title="Risikotragfähigkeit" dimension={result.capacity} />
        {result.toleranceExceedsCapacity && (
          <p className="risk-warning">
            Deine Bereitschaft liegt über deiner finanziellen Tragfähigkeit. Das ist ein Hinweis,
            keine Empfehlung.
          </p>
        )}
        <p className="risk-basis">Bewertungsmethode Version {result.version}.</p>
      </div>
    </fieldset>
  );
}
