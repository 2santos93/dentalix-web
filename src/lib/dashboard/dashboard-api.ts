import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type GetDashboardParams = paths['/api/v1/dashboard']['get']['parameters']['query'];

export type Dashboard = components['schemas']['DashboardDto'];

/**
 * `GET /dashboard?from&to&currency&upcomingLimit` — owner/admin-only summary
 * (incomes/payments totals, low-stock items, upcoming appointments, patient
 * count) for the requested period. The backend 403s any other role; callers
 * show that in Spanish via `apiErrorMessage` rather than a generic error
 * (see `DashboardView`).
 */
export async function getDashboard(token: string, params: GetDashboardParams): Promise<Dashboard> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  search.set('currency', params.currency);
  if (params.upcomingLimit !== undefined) {
    search.set('upcomingLimit', String(params.upcomingLimit));
  }

  return apiFetch<Dashboard>(`/dashboard?${search.toString()}`, {
    token,
  });
}
