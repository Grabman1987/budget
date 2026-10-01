import { Registers, SectionHead, type RegisterItem } from '@budget/ui';
import type { ReactNode } from 'react';
import { AREAS, areaById } from '../nav/areas';
import type { PageMeta } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { AreaHead } from './area-head';
import { PanelLink } from '../shell/panel-link';
import { Link } from '@tanstack/react-router';

export interface PlaceholderPageProps {
  meta: PageMeta;
  /** Overrides the title of the title block (single account, single report). */
  title?: string;
  extraFields?: Array<{ label: string; value: ReactNode }>;
  children?: ReactNode;
}

export interface PageFrameProps {
  meta: PageMeta;
  title?: string;
  subtitle?: string;
  /** Cells after the area's own fields in the title block. */
  extraFields?: Array<{ label: string; value: ReactNode }>;
  /** Placeholder pages add a "Gefüllt in" cell. */
  placeholder?: boolean;
  /** Plan: the month's income in the title block. */
  income?: ReactNode;
  /** Replaces the value of the "Stand" cell (Vermögen › Portfolio: price refresh). */
  stand?: ReactNode;
  children?: ReactNode;
}

/** Title block and registers of the area; the body of the page follows as children. */
export function PageFrame({
  meta,
  title,
  subtitle,
  extraFields,
  placeholder,
  income,
  stand,
  children,
}: PageFrameProps) {
  const area = areaById(meta.area);
  const items: RegisterItem[] = area.registers.map((r) => ({
    id: r.id,
    label: r.label,
    href: r.to,
  }));
  return (
    <>
      <AreaHead
        meta={meta}
        title={title}
        subtitle={subtitle}
        extraFields={extraFields}
        placeholder={placeholder}
        income={income}
        stand={stand}
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
      {children}
    </>
  );
}

/**
 * Placeholder page: title block and registers of the area, plus a note which package fills it.
 * Later packages replace the body and keep the frame.
 */
export function PlaceholderPage({ meta, title, extraFields, children }: PlaceholderPageProps) {
  return (
    <PageFrame
      meta={meta}
      {...(title ? { title } : {})}
      {...(extraFields ? { extraFields } : {})}
      placeholder
    >
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
    </PageFrame>
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
