import { useParams } from '@tanstack/react-router';
import { ACCOUNT_PAGE } from '../nav/pages';
import { PlaceholderPage } from './placeholder-page';

/** Single account (`/konten/$id`): the id is an opaque URL segment until P2 provides accounts. */
export function AccountPage({ id }: { id: string }) {
  return <PlaceholderPage meta={ACCOUNT_PAGE} title={`Konto ${id}`} />;
}

/** Route component of `/konten/$id`. */
export function AccountRoute() {
  const { id } = useParams({ strict: false }) as { id: string };
  return <AccountPage id={id} />;
}
