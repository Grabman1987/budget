import { shellIdentity, EMPTY_PROFILE, type Profile } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';

export const PROFILE_KEY = ['profile'] as const;
export const PROFILE_PATH = '/api/profile';

export const profileQuery = () => ({
  queryKey: PROFILE_KEY,
  queryFn: () => request<Profile>('GET', PROFILE_PATH),
  staleTime: 60_000,
});

/** Name and initials for the sidebar and the phone header; generic ("Profil", "NU") until set. */
export function useShellIdentity() {
  const query = useQuery(profileQuery());
  return shellIdentity(query.data ?? EMPTY_PROFILE);
}
