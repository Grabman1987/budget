import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '@budget/ui';
import { PanelLeft, Plus } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { PrivacyButton } from './privacy-button';
import { InboxHeaderLink } from '../inbox/navigation';
import { useInboxCount } from './inbox';
import { PanelLink } from './panel-link';
import { MobileProfile } from './mobile-chrome';
import './page-header.css';

/** One shell rail for every main area; optional controls never size the utility slots. */
export function PageHeader({
  title,
  mobileTitle,
  showProfile = false,
  mobileHeading = false,
  controls,
  collapsed,
  onToggle,
  onSearchChange,
  onControlsPlacement,
}: {
  title: string;
  mobileTitle?: string | undefined;
  showProfile?: boolean;
  mobileHeading?: boolean;
  controls?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  onSearchChange: (open: boolean) => void;
  /** Reports `body` when the page controls do not fit the header and must render in the page body. */
  onControlsPlacement?: (place: 'header' | 'body') => void;
}) {
  const phone = useIsPhone();
  const slot = useRef<HTMLDivElement>(null);
  const need = useRef(0);
  const [fits, setFits] = useState(true);
  const hasControls = controls !== undefined && controls !== null;
  // Controls are never clipped: when the slot is too narrow they move to the page body.
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el || !hasControls || phone) return;
    const check = () => {
      if (fits) {
        if (el.scrollWidth > el.clientWidth + 1) {
          need.current = el.scrollWidth;
          setFits(false);
        }
      } else if (el.clientWidth >= need.current) setFits(true);
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fits, hasControls, phone]);
  const placement = hasControls && !phone && !fits ? 'body' : 'header';
  useLayoutEffect(() => onControlsPlacement?.(placement), [placement, onControlsPlacement]);
  const inbox = useInboxCount();
  const detailTitle = phone && mobileTitle && mobileTitle !== title ? mobileTitle : undefined;
  const Title = phone && mobileHeading && !detailTitle ? 'h1' : 'p';
  const DetailTitle = mobileHeading ? 'h1' : 'p';
  return (
    <header className={`page-header ${phone ? 'm-head' : 'topbar'}`}>
      <div className="page-header-row">
        {!phone && (
          <button
            type="button"
            className="icon-btn page-header-sidebar"
            onClick={onToggle}
            aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
          >
            <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <Title className={`page-header-title${detailTitle ? '' : ' m-title-text'}`}>{title}</Title>
        <div className="page-header-controls" ref={slot}>
          {!phone && fits && controls}
        </div>
        <div className="page-header-search">
          <GlobalSearch mobile={phone} compactLabel onOpenChange={onSearchChange} />
        </div>
        <div className="page-header-actions topbar-actions">
          <PrivacyButton />
          <InboxHeaderLink className="review-pill" aria-label={inbox.label}>
            <span className="page-header-review-label">Prüfen</span>
            {inbox.count !== undefined && inbox.count > 0 && (
              <span>{phone ? inbox.count : ` · ${inbox.count}`}</span>
            )}
            {!inbox.count && (
              <span className="page-header-review-fallback" aria-hidden="true">
                {inbox.count ?? '…'}
              </span>
            )}
          </InboxHeaderLink>
          <PanelLink
            className="btn btn-primary page-header-booking"
            panel="buchung"
            aria-label="Buchung"
            aria-keyshortcuts="n"
            title="Buchung erfassen (N)"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Buchung</span>
          </PanelLink>
        </div>
        {phone && (
          <div className="page-header-profile">
            {showProfile && <MobileProfile privacy={false} />}
          </div>
        )}
      </div>
      {detailTitle && (
        <DetailTitle className="page-header-detail-title m-title-text">{detailTitle}</DetailTitle>
      )}
    </header>
  );
}
