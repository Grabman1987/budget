import { FuturePreviewSetting } from './future-preview-setting';
import {
  Button,
  Field,
  SectionHead,
  Select,
  TextInput,
  useToast,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import {
  deriveInitials,
  isPlausibleBirthDate,
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  isRiskAnswer,
  REGIONS,
  todayInVienna,
  type Profile,
  type RegionCode,
  type RiskAnswers,
  type RiskQuestionKey,
} from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { errorText } from '../ledger/labels';
import { PROFILE_META } from '../nav/pages';
import { PROFILE_KEY, PROFILE_PATH, profileQuery } from '../shell/use-profile';
import { RiskProfileSection } from './risk-profile-section';
import { PageFrame } from './placeholder-page';
import './profile-settings.css';
import { PrivacyButton } from '../shell/privacy-button';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { SettingsDraftGuard } from './settings-draft-guard';
import { undoGroup } from '../ledger/api';

interface Draft {
  name: string;
  initials: string;
  /** The owner typed his own initials; until then they follow the name. */
  initialsEdited: boolean;
  birthDate: string;
  household: string;
  region: string;
  risk: RiskAnswers;
}

const draftOf = (p: Profile): Draft => ({
  name: p.name,
  initials: p.initials,
  initialsEdited: p.initials !== '' && p.initials !== deriveInitials(p.name),
  birthDate: p.birthDate,
  household: p.household === null ? '' : String(p.household),
  region: p.region ?? '',
  risk: p.risk,
});

const sameRisk = (a: RiskAnswers, b: RiskAnswers) =>
  (Object.keys(a) as RiskQuestionKey[]).every((k) => a[k] === b[k]);

const sameProfile = (a: Profile, b: Profile) =>
  a.name === b.name &&
  a.initials === b.initials &&
  a.birthDate === b.birthDate &&
  a.household === b.household &&
  a.region === b.region &&
  sameRisk(a.risk, b.risk);

type Errors = Partial<Record<'birthDate' | 'household', string>>;

/** Einstellungen › Profil: who the owner is, for the later comparison with Statistik Austria. */
export function ProfileSettingsPage() {
  useAmountPrivacy();
  if (REDESIGN_ENABLED)
    return (
      <PageFrame meta={PROFILE_META}>
        <ProfilePanel />
        <details className="settings-advanced">
          <summary>Darstellung & Datenschutz</summary>
          <section className="profile-settings" aria-labelledby="privacy-title">
            <SectionHead id="privacy-title" title="Privatmodus" />
            <PrivacyButton text />
            <p>Beträge auf diesem Gerät verbergen · Strg Umschalt H.</p>
          </section>
          <FuturePreviewSetting />
          <FuturePreviewSetting reminder />
        </details>
      </PageFrame>
    );
  return (
    <PageFrame meta={PROFILE_META} revealCurrentRegister>
      {REDESIGN_ENABLED && <ProfilePanel />}
      <section className="profile-settings" aria-labelledby="privacy-title">
        <SectionHead id="privacy-title" title="Privatmodus" />
        <PrivacyButton text />
        <p>
          Beträge auf diesem Gerät verbergen · Strg Umschalt H. Buchungen und Berechnungen bleiben
          unverändert.
        </p>
      </section>
      <FuturePreviewSetting />
      <FuturePreviewSetting reminder />
      {!REDESIGN_ENABLED && <ProfilePanel />}
    </PageFrame>
  );
}

export function ProfilePanel() {
  useAmountPrivacy();
  const query = useQuery(profileQuery());
  return (
    <section className="profile-settings" aria-labelledby="profile-title">
      <SectionHead id="profile-title" title="Profil" />
      {!REDESIGN_ENABLED && (
        <p className="profile-purpose">
          Wofür? Die App soll später dein Einkommen und Vermögen mit den Zahlen der Statistik
          Austria vergleichen: nach Alter, Haushaltsgröße und Bundesland. Alle Angaben sind
          freiwillig und bleiben in deiner Datenbank. Name und Kürzel erscheinen in der
          Seitenleiste.
        </p>
      )}
      {query.isPending && <p role="status">Lädt …</p>}
      {query.isError && (
        <p className="field-error" role="alert">
          Das Profil konnte nicht geladen werden.
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
      {query.data && (
        <ProfileForm
          key={REDESIGN_ENABLED ? 'profile' : JSON.stringify(query.data)}
          saved={query.data}
        />
      )}
      {REDESIGN_ENABLED && (
        <details className="settings-advanced">
          <summary>Wofür werden die Profilangaben verwendet?</summary>
          <p>
            Die Angaben sind freiwillig. Alter, Haushaltsgröße und Bundesland dienen dem Vergleich
            mit Statistik Austria. Name und Kürzel erscheinen in der Seitenleiste.
          </p>
        </details>
      )}
      {REDESIGN_ENABLED && query.dataUpdatedAt > 0 && (
        <p className="settings-source-stamp">
          Profil geladen:{' '}
          {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(
            query.dataUpdatedAt,
          )}
        </p>
      )}
    </section>
  );
}

function ProfileForm({ saved }: { saved: Profile }) {
  useAmountPrivacy();
  const client = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState<{ source: Profile; draft: Draft }>();
  const baseline = edit?.source ?? saved;
  const draft = edit?.draft ?? draftOf(saved);
  const setDraft = (update: (draft: Draft) => Draft) =>
    setEdit((previous) => ({
      source: previous?.source ?? saved,
      draft: update(previous?.draft ?? draftOf(saved)),
    }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<Errors>({});

  const initials = draft.initialsEdited ? draft.initials : deriveInitials(draft.name);
  const householdText = draft.household.trim();
  const household = householdText === '' ? null : Number(householdText);
  const body = {
    name: draft.name.trim(),
    initials: initials.trim(),
    birthDate: draft.birthDate,
    household,
    region: draft.region === '' ? null : (draft.region as RegionCode),
    risk: draft.risk,
  };
  const dirty =
    body.name !== baseline.name ||
    body.initials !== baseline.initials ||
    body.birthDate !== baseline.birthDate ||
    body.household !== baseline.household ||
    body.region !== baseline.region ||
    !sameRisk(body.risk, baseline.risk);
  const stale = REDESIGN_ENABLED && !sameProfile(baseline, saved);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setError(undefined);
    const found: Errors = {};
    if (
      household !== null &&
      !(Number.isInteger(household) && household >= 1 && household <= PROFILE_HOUSEHOLD_MAX)
    )
      found.household = `Bitte eine ganze Zahl von 1 bis ${PROFILE_HOUSEHOLD_MAX} eintragen.`;
    if (draft.birthDate !== '' && !isPlausibleBirthDate(draft.birthDate, todayInVienna()))
      found.birthDate = 'Bitte ein gültiges Datum in der Vergangenheit eintragen.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      if (REDESIGN_ENABLED) {
        const latest = await request<Profile>('GET', PROFILE_PATH);
        if (!sameProfile(latest, baseline)) {
          client.setQueryData(PROFILE_KEY, latest);
          setError(
            'Das Profil wurde inzwischen geändert. Dein Entwurf bleibt erhalten. Lade den aktuellen Stand, bevor du erneut speicherst.',
          );
          return;
        }
      }
      const result = await request<Profile & { groupId: string }>('PATCH', PROFILE_PATH, body);
      const profile: Profile = {
        name: result.name,
        initials: result.initials,
        birthDate: result.birthDate,
        household: result.household,
        region: result.region,
        risk: result.risk,
      };
      client.setQueryData(PROFILE_KEY, profile);
      setEdit(undefined);
      toast.show({
        message: 'Profil gespeichert.',
        ...(REDESIGN_ENABLED
          ? {
              actionLabel: 'Rückgängig',
              onAction: () =>
                void undoGroup(result.groupId)
                  .then(() => client.invalidateQueries({ queryKey: PROFILE_KEY }))
                  .catch((e: unknown) => toast.show({ message: errorText(e) })),
            }
          : {}),
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 422
          ? errorText(e)
          : 'Das Profil konnte nicht gespeichert werden. Bitte erneut versuchen.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
    >
      {REDESIGN_ENABLED && <SettingsDraftGuard dirty={dirty} busy={busy} />}
      {stale && (
        <p role="alert">
          Das Profil wurde inzwischen geändert. Dein Entwurf wurde nicht überschrieben.
        </p>
      )}
      <div className="profile-grid">
        <Field label="Name" hint="So steht es in der Seitenleiste.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              value={draft.name}
              maxLength={PROFILE_NAME_MAX}
              autoComplete="given-name"
              aria-describedby={describedBy}
              disabled={busy}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>
        <Field label="Kürzel" hint="Aus dem Namen abgeleitet, du kannst es ändern.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              value={initials}
              maxLength={PROFILE_INITIALS_MAX}
              autoComplete="off"
              aria-describedby={describedBy}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  initials: e.target.value.toLocaleUpperCase('de-AT'),
                  initialsEdited: true,
                }))
              }
            />
          )}
        </Field>
        <Field label="Geburtsdatum" error={errors.birthDate} hint="Nur für den Altersvergleich.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="date"
              value={draft.birthDate}
              autoComplete="bday"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          )}
        </Field>
        <Field label="Personen im Haushalt" error={errors.household} hint="Mit dir gezählt.">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={PROFILE_HOUSEHOLD_MAX}
              value={draft.household}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              onChange={(e) => set('household', e.target.value)}
            />
          )}
        </Field>
        <Field label="Region (Bundesland)">
          {({ id }) => (
            <Select
              id={id}
              value={draft.region}
              disabled={busy}
              onChange={(e) => set('region', e.target.value)}
            >
              <option value="">Keine Angabe</option>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <RiskProfileSection
        answers={draft.risk}
        disabled={busy}
        onChange={(key, value) =>
          setDraft((d) => ({
            ...d,
            risk: { ...d.risk, [key]: isRiskAnswer(key, value) ? value : null },
          }))
        }
      />
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
      {REDESIGN_ENABLED ? (
        <div className="profile-actions">
          <Button type="submit" disabled={busy || !dirty || stale}>
            {busy ? 'Speichert …' : 'Speichern'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || (!dirty && !stale)}
            onClick={() => {
              setEdit(undefined);
              setErrors({});
              setError(undefined);
            }}
          >
            {' '}
            {stale ? 'Aktuellen Stand laden' : 'Verwerfen'}{' '}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Speichert …' : 'Speichern'}
        </Button>
      )}
    </form>
  );
}
