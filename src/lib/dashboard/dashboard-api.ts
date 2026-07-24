import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type GetDashboardParams = paths['/api/v1/dashboard']['get']['parameters']['query'];

/**
 * `DashboardDto` (and its nested `DashboardIncomesDto`) are fully
 * `@ApiProperty()`-decorated response DTOs (`DashboardController` uses
 * `@ApiOkResponse` with them, see `schema.d.ts`), so the generated shape is
 * otherwise reliable to reuse directly — same convention as
 * `TreatmentPlan`/`TreatmentPlanItem` in `treatment-plans-api.ts`.
 *
 * The one exception is `incomes.byCurrency`: on the backend it's a plain
 * `Record<string, number>` (documented via `@ApiProperty({ example: {...} })`
 * with no explicit `additionalProperties` schema), which openapi-typescript
 * can't infer from an example alone — it generates `Record<string, never>`
 * for it. `Dashboard` overrides just that field to the real wire shape;
 * everything else is the generated `DashboardDto` verbatim. Keep this override
 * in sync if the backend ever adds an explicit `additionalProperties` schema
 * (at which point it could be dropped).
 *
 * NOTE (PAY-T4): the backend field was renamed `sales` → `incomes` (the
 * dashboard now sums abonos/payments, not sales) — see
 * `DashboardIncomesDto`/`DashboardDto.incomes` in `schema.d.ts`.
 */
export type Dashboard = Omit<components['schemas']['DashboardDto'], 'incomes'> & {
  incomes: Omit<components['schemas']['DashboardIncomesDto'], 'byCurrency'> & {
    byCurrency: Record<string, number>;
  };
};

/**
 * `GET /dashboard?from&to&currency&upcomingLimit` — owner/admin-only summary
 * (incomes/payments totals, low-stock items, upcoming appointments, patient
 * count) for the requested period. The backend 403s any other role; callers
 * should surface `ApiError.message` for that case rather than a generic error
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
