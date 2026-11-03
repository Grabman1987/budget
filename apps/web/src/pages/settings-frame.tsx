import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { SettingsBack, SettingsNav } from './settings-nav';
import type { PageMeta } from '../nav/pages';
import './settings-redesign.css';
import { useAuthMethodLabel } from '../auth/status-query';

/** The settings reference has one shell head and a compact working column, without a title block. */
export function RedesignSettingsFrame({
  meta,
  children,
}: {
  meta: PageMeta;
  children?: ReactNode;
}) {
  const { search } = useLocation();
  const authMethod = useAuthMethodLabel();
  const targets = search['ansicht'] === 'stufen';
  return (
    <div
      className="settings-redesign"
      data-settings-page={meta.register ?? 'index'}
      data-settings-targets={targets || undefined}
    >
      {meta.register ? (
        <div className="settings-layout">
          <SettingsNav variant="rail" />
          <div className="settings-body">
            <SettingsBack current={meta.register} />
            {['profil', 'sicherheit'].includes(meta.register) && (
              <p className="settings-session">
                <span>Anmeldung</span>: <span>{authMethod}</span>
              </p>
            )}
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
