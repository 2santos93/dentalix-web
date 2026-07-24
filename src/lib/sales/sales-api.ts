import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type CreateSaleInput = components['schemas']['CreateSaleDto'];
export type CreateSaleLineItemInput = components['schemas']['CreateSaleLineItemDto'];

// Re-used from the generated OpenAPI schema (`CreateSaleDto.paymentMethod`
// carries `@ApiPropertyOptional({ enum: PaymentMethod })`, mirroring the
// backend `PaymentMethod` Prisma enum) so it stays in sync without
// duplicating the literal list by hand — same convention as
// `AppointmentStatus` in `appointments-api.ts`.
export type PaymentMethod = NonNullable<CreateSaleInput['paymentMethod']>;

/**
 * `SaleDto`/`SaleLineItemDto` are fully `@ApiProperty()`-decorated response
 * DTOs on the backend (`SalesController` uses `@ApiOkResponse`/
 * `@ApiCreatedResponse` with them on every route), so the generated
 * `schema.d.ts` already carries the exact wire shape — unlike
 * `Appointment`/`DentalCatalogItem`, there is no need to hand-type these.
 * `lineItems` is only populated by `createSale`/`getSale` (`listSales`
 * returns the bare sale) — see `SaleDto` on the backend.
 */
export type Sale = components['schemas']['SaleDto'];
export type SaleLineItem = components['schemas']['SaleLineItemDto'];

/**
 * `SalesTotalsDto` is `@ApiProperty()`-decorated (`SalesController.totals`
 * uses `@ApiOkResponse({ type: SalesTotalsDto })`), but `byCurrency` is
 * documented via `@ApiProperty({ example: {...} })` with no explicit
 * `additionalProperties` schema — openapi-typescript can't infer a
 * `Record<string, number>` from an example alone, so it generates
 * `Record<string, never>` for it. `SalesTotals` overrides just that field
 * to the real wire shape; everything else is the generated `SalesTotalsDto`
 * verbatim. Same situation/fix as `Dashboard.sales.byCurrency` in
 * `dashboard-api.ts` — keep both in sync if the backend ever adds an
 * explicit `additionalProperties` schema (at which point this override
 * could be dropped).
 */
export type SalesTotals = Omit<components['schemas']['SalesTotalsDto'], 'byCurrency'> & {
  byCurrency: Record<string, number>;
};

export type ListSalesParams = paths['/api/v1/sales']['get']['parameters']['query'];
export type GetSalesTotalsParams = paths['/api/v1/sales/totals']['get']['parameters']['query'];

/** `POST /sales` — records a sale (`createdById` is derived server-side from the JWT). */
export async function createSale(token: string, input: CreateSaleInput): Promise<Sale> {
  return apiFetch<Sale>('/sales', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `GET /sales?from&to&patientId` — `from`/`to` form a half-open range
 * `[from, to)` on `paidAt` (backend contract, see `ListSalesUseCase`) —
 * callers wanting an inclusive "Hasta" must extend `to` by one day
 * themselves (see `addOneDayIso` in `dashboard/date-range.ts`, reused by
 * `SalesView`). All params are optional — an empty call lists every active
 * sale.
 */
export async function listSales(token: string, params: ListSalesParams = {}): Promise<Sale[]> {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.patientId) search.set('patientId', params.patientId);
  const qs = search.toString();

  return apiFetch<Sale[]>(`/sales${qs ? `?${qs}` : ''}`, {
    token,
  });
}

/** `GET /sales/:id` — sale detail, with `lineItems`. */
export async function getSale(token: string, id: string): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${id}`, {
    token,
  });
}

/**
 * `DELETE /sales/:id` — voids the sale (`deletedAt` set on the backend, see
 * `VoidSaleUseCase`). The route responds `200` with an EMPTY body
 * (`content?: never` in the generated schema), so this uses
 * `apiFetchOrNull` — same rationale as `removeItem` in
 * `treatment-plans-api.ts` — instead of `apiFetch`, which would throw
 * trying to `res.json()` an empty response.
 */
export async function voidSale(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/sales/${id}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * `GET /sales/totals?from&to&currency` — sum of every active sale's total
 * in `[from, to)` (half-open, same convention as `listSales`), each
 * converted to `currency` using ITS OWN `paidAt` date's exchange rate
 * (never today's rate). `from`/`to`/`currency` are all required by the
 * backend (`SalesTotalsQueryDto`), unlike `listSales`'s optional range.
 */
export async function getSalesTotals(token: string, params: GetSalesTotalsParams): Promise<SalesTotals> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  search.set('currency', params.currency);

  return apiFetch<SalesTotals>(`/sales/totals?${search.toString()}`, {
    token,
  });
}
