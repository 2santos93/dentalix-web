import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
export type VisitAssignment = components["schemas"]["VisitItemDto"];
export type PlanVisit = components["schemas"]["PlanVisitSummaryDto"];
export type PlanVisits = components["schemas"]["PlanVisitsDto"];
export type UnscheduledPlan = components["schemas"]["UnscheduledPlanDto"];
export type UnscheduledPage = components["schemas"]["UnscheduledPlansPageDto"];
export function getPlanVisits(token: string, id: string) {
  return apiFetch<PlanVisits>(`/treatment-plans/${id}/visits`, { token });
}
export function updatePlanVisits(
  token: string,
  id: string,
  body: { items: VisitAssignment[]; visitIntervals: Record<string, number> },
) {
  return apiFetch<PlanVisits>(`/treatment-plans/${id}/visits`, {
    token,
    method: "PATCH",
    body,
  });
}
export function listUnscheduledPlans(
  token: string,
  input: { locationId?: string; olderThanDays?: number; cursor?: string } = {},
) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) q.set(key, String(value));
  return apiFetch<UnscheduledPage>(`/treatment-plans/unscheduled?${q}`, {
    token,
  });
}
