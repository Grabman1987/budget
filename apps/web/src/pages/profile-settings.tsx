import {
  deriveInitials,
  isPlausibleBirthDate,
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  REGIONS,
  todayInVienna,
  type Profile,
  type RegionCode,
} from '@budget/domain';
import { Button, Field, SectionHead, Select, TextInput, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, request } from '../api/http';
import { errorText } from '../ledger/labels';
import { PROFILE_META } from '../nav/pages';
import { PROFILE_KEY, PROFILE_PATH, profileQuery } from '../shell/use-profile';
import { PageFrame } from './placeholder-page';
import './profile-settings.css';

interface Draft {
  name: string;
  initials: string;
  /** The owner typed his own initials; until then they follow the name. */
  initialsEdited: boolean;
  birthDate: string;
  household: string;
  region: string;
}

const draftOf = (p: Profile): Draft => ({
  name: p.name,
  initials: p.initials,
  initialsEdited: p.initials !== '' && p.initials !== deriveInitials(p.name),
  birthDate: p.birthDate,
  household: p.household === null ? '' : String(p.household),
  region: p.region ?? '',
});

type Errors = Partial<Record<'birthDate' | 'household', string>>;

/** Einstellungen › Profil: who the owner is, for the later comparison with Statistik Austria. */
export function ProfileSettingsPage() {
  return (
    <PageFrame meta={PROFILE_META} revealCurrentRegister>
      <ProfilePanel />
    </PageFrame>
  );
}

export function ProfilePanel() {
  const query = useQuery(profileQuery());
  return (
    <section className="profile-settings" aria-labelledby="profile-title">
      <SectionHead id="profile-title" title="Profil" />
      <p className="profile-purpose">
        Wofür? Die App soll später dein Einkommen und Vermögen mit den Zahlen der Statistik Austria
        vergleichen: nach Alter, Haushaltsgröße und Bundesland. Alle Angaben sind freiwillig und
        bleiben in deiner Datenbank. Name und Kürzel erscheinen in der Seitenleiste.
      </p>
      {query.isPending && <p role="status">Lädt …</p>}
      {query.isError && (
        <p className="field-error" role="alert">
          Das Profil konnte nicht geladen werden.
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
      {query.data && <ProfileForm key={JSON.stringify(query.data)} saved={query.data} />}
    </section>
  );
}

function ProfileForm({ saved }: { saved: Profile }) {
  const client = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
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
  };
  const dirty =
    body.name !== saved.name ||
    body.initials !== saved.initials ||
    body.birthDate !== saved.birthDate ||
    body.household !== saved.household ||
    body.region !== saved.region;

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
      const result = await request<Profile & { groupId: string }>('PATCH', PROFILE_PATH, body);
      const profile: Profile = {
        name: result.name,
        initials: result.initials,
        birthDate: result.birthDate,
        household: result.household,
        region: result.region,
      };
      client.setQueryData(PROFILE_KEY, profile);
      toast.show({ message: 'Profil gespeichert.' });
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
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !dirty}>
        {busy ? 'Speichert …' : 'Speichern'}
      </Button>
    </form>
  );
}
