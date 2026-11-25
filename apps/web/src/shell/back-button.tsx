import { ArrowLeft } from 'lucide-react';
import type { ComponentProps } from 'react';
import { AppLink } from './app-link';
import './page-shell.css';

type BackButtonProps = Omit<ComponentProps<typeof AppLink>, 'children'> & {
  /** Full accessible name and tooltip, e.g. "Zurück zu Heute"; the visible text stays "Zurück". */
  label?: string;
};

/** The one back button of the app: left-aligned, arrow plus "Zurück". */
export function BackButton({ label, className, ...link }: BackButtonProps) {
  return (
    <AppLink
      {...link}
      className={`back-button${className ? ` ${className}` : ''}`}
      {...(label ? { title: label, 'aria-label': label } : {})}
    >
      <ArrowLeft className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      Zurück
    </AppLink>
  );
}
