import { ACCOUNT_PAGE } from '../nav/pages';
import { useSetPageTitle } from '../shell/page-meta';
import { PlaceholderPage } from './placeholder-page';

/** Single account (`/konten/$id`): the id is an opaque URL segment until P2 provides accounts. */
export function AccountPage({ id }: { id: string }) {
  useSetPageTitle(`Konto ${id}`);
  return <PlaceholderPage meta={ACCOUNT_PAGE} title={`Konto ${id}`} />;
}
