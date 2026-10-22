import { SectionHead } from '@budget/ui';
import { AppLink } from '../shell/app-link';
import { settingsSectionMeta, SETTINGS_DESTINATIONS } from '../settings/navigation';
import { PageFrame } from './placeholder-page';
import { DisplayPreferences } from './display-preferences';
import { FuturePreviewSetting } from './future-preview-setting';

export function DisplaySettingsPage() {
  return <PageFrame meta={settingsSectionMeta('darstellung')}>
    <DisplayPreferences />
    <FuturePreviewSetting />
    <FuturePreviewSetting reminder />
  </PageFrame>;
}
export function AutomationSettingsPage() {
  return <PageFrame meta={settingsSectionMeta('regeln-automatik')}>
    <section className="settings-section-links" aria-labelledby="automation-settings-title">
      <SectionHead id="automation-settings-title" title="Regeln und Automatik" />
      <AppLink to={SETTINGS_DESTINATIONS.rules}>Regeln aktivieren und Schwellen einstellen</AppLink>
      <AppLink to={SETTINGS_DESTINATIONS.assignment}>Zuordnungsregeln und Einnahmenzuordnung</AppLink>
      <p>Ergebnisse und offene Prüfungen findest du im <AppLink to={SETTINGS_DESTINATIONS.check}>Finanz-Check</AppLink>.</p>
    </section>
  </PageFrame>;
}
export function AdvancedSettingsPage() {
  return <PageFrame meta={settingsSectionMeta('erweitert')}>
    <section className="settings-section-links" aria-labelledby="advanced-settings-title">
      <SectionHead id="advanced-settings-title" title="Erweitert" />
      <AppLink to={SETTINGS_DESTINATIONS.profile}>Profil bearbeiten</AppLink>
      <AppLink to={SETTINGS_DESTINATIONS.projects}>Projekte verwalten</AppLink>
    </section>
  </PageFrame>;
}
