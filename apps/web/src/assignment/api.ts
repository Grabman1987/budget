import type { AssignmentRule, readAssignmentCandidate, readBookingAssignments } from '@budget/db';
import type { AssignmentRuleInput } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export const ASSIGNMENT_KEY = [...LEDGER_KEY, 'assignment-rules'] as const;
export const assignmentQuery = queryOptions({
  queryKey: ASSIGNMENT_KEY,
  queryFn: () => request<{ rules: AssignmentRule[] }>('GET', '/api/assignment-rules'),
});
export const candidateAssignmentQuery = (id: string) =>
  queryOptions({
    queryKey: [...ASSIGNMENT_KEY, 'candidate', id],
    retry: false,
    queryFn: () =>
      request<ReturnType<typeof readAssignmentCandidate>>(
        'GET',
        '/api/assignment-rules/candidates/' + encodeURIComponent(id),
      ),
  });
export const bookingAssignmentQuery = (id: string) =>
  queryOptions({
    queryKey: [...ASSIGNMENT_KEY, 'booking', id],
    retry: false,
    queryFn: () =>
      request<ReturnType<typeof readBookingAssignments>>(
        'GET',
        '/api/assignment-rules/bookings/' + encodeURIComponent(id),
      ),
  });
export const learnAssignment = (id: string) =>
  request<{ draft: AssignmentRuleInput }>(
    'GET',
    '/api/assignment-rules/bookings/' + encodeURIComponent(id) + '/learn',
  );
