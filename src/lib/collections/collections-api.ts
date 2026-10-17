import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// Cobranza (DX-150). Las formas salen del Swagger de la API.
export type CollectionNote = components['schemas']['CollectionNoteDto'];
export type PaymentPromise = components['schemas']['PaymentPromiseDto'];
export type PatientCollections = components['schemas']['PatientCollectionsDto'];
export type CollectionChannel = CollectionNote['channel'];
export type CollectionOutcome = CollectionNote['outcome'];
export type PaymentPromiseStatus = PaymentPromise['status'];
export type OverdueBalance = components['schemas']['OverdueBalanceDto'];
export type CreateCollectionNoteInput = components['schemas']['CreateCollectionNoteDto'];
export type CreatePaymentPromiseInput = components['schemas']['CreatePaymentPromiseDto'];

/** `POST /patients/:id/collection-notes` — append-only: no hay editar ni borrar. */
export function createCollectionNote(
  token: string,
  patientId: string,
  input: CreateCollectionNoteInput,
): Promise<CollectionNote> {
  return apiFetch<CollectionNote>(`/patients/${patientId}/collection-notes`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /patients/:id/payment-promises` — uno abierto por paciente. */
export function createPaymentPromise(
  token: string,
  patientId: string,
  input: CreatePaymentPromiseInput,
): Promise<PaymentPromise> {
  return apiFetch<PaymentPromise>(`/patients/${patientId}/payment-promises`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /patients/:id/collections` — gestiones y compromisos, más recientes primero. */
export function getPatientCollections(token: string, patientId: string): Promise<PatientCollections> {
  return apiFetch<PatientCollections>(`/patients/${patientId}/collections`, { token });
}
