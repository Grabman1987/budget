import { SETTINGS_INDEX } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { SettingsNav } from './settings-nav';

/** Einstellungen › Übersicht: all settings pages in groups. Desktop redirects to the first page. */
export function SettingsIndexPage() {
  return (
    <PageFrame meta={SETTINGS_INDEX}>
      <SettingsNav variant="index" />
    </PageFrame>
  );
}
