import { ChevronLeft, Info } from 'lucide-react';
import { useEffect, useSyncExternalStore, useCallback, useRef, type ReactNode } from 'react';
import { PageFrame, type PageFrameProps } from '../pages/placeholder-page';
import { PageMenu } from '../nav/page-menu';
import { areaById } from '../nav/areas';
import { AppLink } from '../shell/app-link';
import { MobileStatusLine } from '../shell/header-status';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { useIsPhone } from '@budget/ui';
import './konten-frame.css';
import { longDay } from './format';

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
  const isPhone = useIsPhone();
  const phoneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isPhone && !document.querySelector('dialog[open]'))
      phoneHeading.current?.focus({ preventScroll: true });
  }, [isPhone, phoneTitle]);
  const inHead = view === 'overview' || view === 'account';
  const menu = (
    <PageMenu
      area={areaById('konten')}
      current={props.meta.register ?? ''}
      iconOnly={inHead && isPhone}
    />
  );
  const phoneHead = (
    <div className={`konten-phone-heading${view === 'account' ? ' is-account' : ''}`}>
      {view === 'account' && (
        <AppLink to="/konten" className="icon-btn" aria-label="Zur Kontenübersicht">
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
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
      {view === 'account' && isPhone ? (
        phoneHead
      ) : (
        <h1 className="sr-only">{view === 'account' ? 'Konten' : (phoneTitle ?? 'Konten')}</h1>
      )}
      {inHead && (
        <div className="konten-view-bar">{!isPhone || view !== 'account' ? menu : null}</div>
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
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
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
