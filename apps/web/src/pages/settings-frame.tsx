import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { SettingsBack, SettingsNav } from './settings-nav';
import type { PageMeta } from '../nav/pages';
import './settings-redesign.css';

/** The settings reference has one shell head and a compact working column, without a title block. */
export function RedesignSettingsFrame({
  meta,
  children,
}: {
  meta: PageMeta;
  children?: ReactNode;
}) {
  const { search } = useLocation();
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
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
