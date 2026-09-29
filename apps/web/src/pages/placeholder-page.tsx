import { Registers, SectionHead, TitleBlock, type RegisterItem } from '@budget/ui';
import type { ReactNode } from 'react';
import { AREAS, areaById } from '../nav/areas';
import type { PageMeta } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PanelLink } from '../shell/panel-link';
import { Link } from '@tanstack/react-router';

export interface PlaceholderPageProps {
  meta: PageMeta;
  /** Overrides the title of the title block (defaults to the page title). */
  title?: string;
  subtitle?: string;
  extraFields?: Array<{ label: string; value: ReactNode }>;
  children?: ReactNode;
}

/** Pkg label for the title block, e.g. "P2" out of "P2 Kern und Migration; …". */
const packageOf = (fills: string) => fills.split(/[\s;,]/)[0] ?? fills;

/**
 * Placeholder page: title block and registers of the area, plus a note which package fills it.
 * Later packages replace the body and keep the frame.
 */
export function PlaceholderPage({
  meta,
  title,
  subtitle,
  extraFields = [],
  children,
}: PlaceholderPageProps) {
  const area = areaById(meta.area);
  const items: RegisterItem[] = area.registers.map((r) => ({
    id: r.id,
    label: r.label,
    href: r.to,
  }));
  const question = subtitle ?? meta.question;
  return (
    <>
      <TitleBlock
        title={title ?? meta.title}
        {...(question ? { subtitle: question } : {})}
        fields={[...extraFields, { label: 'Gefüllt in', value: `Paket ${packageOf(meta.fills)}` }]}
        compactOnMobile
      />
      {items.length > 0 && (
        <Registers
          label={`Register von ${area.label}`}
          items={items}
          current={meta.register ?? ''}
          renderLink={(item, props) => (
            <AppLink to={item.href ?? '/'} {...props}>
              {item.label}
            </AppLink>
          )}
        />
      )}
      <section className="placeholder" aria-labelledby="placeholder-title">
        <SectionHead id="placeholder-title" title="Noch nicht gebaut" />
        <p>
          Diese Ansicht wird im Paket <strong>{meta.fills}</strong> gefüllt. Bis dahin steht hier
          nur der Rahmen: Schriftfeld, Register und die Adresse der Ansicht.
        </p>
        <p className="text-muted">Vorgesehen laut Spezifikation: {meta.spec}</p>
        <p>
          <PanelLink panel="beispiel" className="btn btn-ghost btn-sm">
            Seitenpanel testen
          </PanelLink>
        </p>
        {children}
      </section>
    </>
  );
}

/** Small helper for pages that only need a link list (report catalog, groups). */
export function LinkList({
  items,
}: {
  items: Array<{ to: string; label: string; note?: string }>;
}) {
  return (
    <ul className="link-list">
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to as never}>{item.label}</Link>
          {item.note && <span className="text-muted"> · {item.note}</span>}
        </li>
      ))}
    </ul>
  );
}

export { AREAS };
