import { ChevronLeft, Info } from 'lucide-react';
import { useEffect, useSyncExternalStore, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PageFrame, type PageFrameProps } from '../pages/placeholder-page';
import { PageMenu } from '../nav/page-menu';
import { areaById } from '../nav/areas';
import { AppLink } from '../shell/app-link';
import { MobileStatusLine } from '../shell/header-status';
import { useInboxCount } from '../shell/inbox';
import { InboxHeaderLink } from '../inbox/navigation';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { useIsPhone } from '@budget/ui';
import './konten-frame.css';
import { longDay } from './format';

type Slots = { desktop: Element | null; phone: Element | null; header: Element | null };

type KontenFrameProps = PageFrameProps & {
  view: 'overview' | 'account' | 'bookings' | 'inbox';
  phoneTitle?: string | undefined;
  sourceDay?: string | undefined;
  headerTools?: ReactNode;
};

/** Area-owned composition; the original frame and shell stay intact in the OFF build. */
export function KontenFrame({
  view,
  phoneTitle,
  sourceDay,
  headerTools,
  ...props
}: KontenFrameProps) {
  return REDESIGN_ENABLED ? (
    <RedesignKontenFrame
      {...props}
      view={view}
      phoneTitle={phoneTitle}
      sourceDay={sourceDay}
      headerTools={headerTools}
    />
  ) : (
    <PageFrame {...props} />
  );
}

function RedesignKontenFrame({
  view,
  phoneTitle,
  sourceDay,
  headerTools,
  children,
  ...props
}: KontenFrameProps) {
  const slots: Slots = {
    desktop: useDomSlot('.topbar-inner'),
    phone: useDomSlot('.m-head .m-title'),
    header: useDomSlot('.m-head'),
  };
  const inbox = useInboxCount();
  const isPhone = useIsPhone();
  const phoneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isPhone && slots.phone && !document.querySelector('dialog[open]'))
      phoneHeading.current?.focus({ preventScroll: true });
  }, [isPhone, slots.phone, phoneTitle]);
  const inHead = view === 'overview' || view === 'account';
  const menu = (
    <PageMenu
      area={areaById('konten')}
      current={props.meta.register ?? ''}
      iconOnly={inHead && isPhone}
    />
  );
  const desktopHead = (
    <div className="konten-desktop-heading">
      <h1>Konten</h1>
      {inHead && (!isPhone || !slots.phone) && menu}
    </div>
  );
  const phoneHead = (
    <div className={`konten-phone-heading${view === 'account' ? ' is-account' : ''}`}>
      {view === 'account' && (
        <AppLink to="/konten" className="icon-btn" aria-label="Zur Kontenübersicht">
          <ChevronLeft size={20} aria-hidden="true" />
        </AppLink>
      )}
      <h1 ref={phoneHeading} tabIndex={-1}>
        {phoneTitle ?? 'Konten'}
      </h1>
      {inHead && isPhone && menu}
    </div>
  );
  return (
    <div
      className={`konten-frame konten-frame-${view}${view === 'inbox' ? ' inbox-redesign' : ''}`}
    >
      {slots.desktop ? createPortal(desktopHead, slots.desktop) : desktopHead}
      {slots.phone && createPortal(phoneHead, slots.phone)}
      {slots.header &&
        createPortal(
          <InboxHeaderLink className="konten-review-count" aria-label={inbox.label}>
            {inbox.count ?? '?'}
          </InboxHeaderLink>,
          slots.header,
        )}
      {!inHead && (
        <div className="konten-view-bar">
          {menu}
          {headerTools}
          {view === 'inbox' && (
            <>
              <div data-konten-slot="inbox-segments" className="konten-inbox-segments-slot" />
              <div data-konten-slot="inbox-sort" className="konten-inbox-sort-slot" />
              <div data-konten-slot="inbox-filters" className="konten-inbox-filters-slot" />
              <div data-konten-slot="inbox-selection" className="konten-inbox-selection-slot" />
              <div data-konten-slot="inbox-safe" className="konten-inbox-safe-slot" />
            </>
          )}
        </div>
      )}
      {children}
      <details className="konten-status-details">
        <summary>
          <Info size={16} aria-hidden="true" />
          {sourceDay ? `Stand ${longDay(sourceDay)}` : 'Status und Datenstand'}
        </summary>
        <MobileStatusLine />
        {props.accountFields?.map((field) => (
          <p key={field.label}>
            {field.label}: {field.value}
          </p>
        ))}
      </details>
    </div>
  );
}

export function useKontenSlot(name: string) {
  return useDomSlot(`[data-konten-slot="${name}"]`);
}

function subscribeSlots(notify: () => void) {
  if (!REDESIGN_ENABLED) return () => {};
  const observer = new MutationObserver(notify);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/** React subscribes to the existing shell DOM, including slots mounted by a route transition. */
function useDomSlot(selector: string) {
  const snapshot = useCallback(
    () => (REDESIGN_ENABLED ? document.querySelector(selector) : null),
    [selector],
  );
  return useSyncExternalStore(subscribeSlots, snapshot, () => null);
}
