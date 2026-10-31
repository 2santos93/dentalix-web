import { render, screen, waitFor, within } from '@testing-library/react';
import { PlanQuoteActions } from './plan-quote-actions';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  listSignatureRequests,
  type SignatureRequest,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { setupUser } from '@/lib/test/user';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';

jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  listSignatureRequests: jest.fn(),
  getSignatureRequestOptions: jest.fn(),
  createSignatureRequest: jest.fn(),
}));

// Las horas, en el reloj de la sede (Caracas, 12 h), no del navegador.
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest
    .fn()
    .mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').caracasSede({ id: 'loc-1' })]),
}));

const mockedList = listSignatureRequests as jest.MockedFunction<typeof listSignatureRequests>;
const mockedOptions = getSignatureRequestOptions as jest.MockedFunction<typeof getSignatureRequestOptions>;
const mockedCreate = createSignatureRequest as jest.MockedFunction<typeof createSignatureRequest>;

const item = {
  id: 'i1',
  tenantId: 't1',
  planId: 'plan-1',
  toothNumber: '11',
  surfaces: [],
  catalogItemId: 'c1',
  price: 100,
  discount: 0,
  visit: 1,
  ...ITEM_WITHOUT_DISCOUNT,
  status: 'PROPOSED' as const,
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function plan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'plan-1',
    tenantId: 't1',
    patientId: 'p1',
    status: 'PRESENTED',
    currency: 'COP',
    notes: null,
    createdById: null,
    ...PLAN_WITHOUT_OPTIONS,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [item],
    total: 100,
    acceptance: null,
    ...overrides,
  };
}

function budgetRequest(overrides: Partial<SignatureRequest> = {}): SignatureRequest {
  return {
    id: 'sr-1',
    patientId: 'p1',
    locationId: 'loc-1',
    type: 'BUDGET',
    channel: 'EMAIL',
    templateId: null,
    templateVersion: null,
    treatmentPlanId: 'plan-1',
    title: 'Presupuesto de tratamiento',
    destinationMasked: 'ma***@example.com',
    signerType: 'PATIENT',
    signerName: 'Marta Ríos',
    professionalUserId: 'u1',
    professionalName: 'Dra. Gómez',
    status: 'OPENED',
    sentAt: '2026-10-30T14:00:00.000Z',
    sentByName: 'Recepción',
    expiresAt: '2026-11-02T14:00:00.000Z',
    openedAt: '2026-10-30T14:05:00.000Z',
    verifiedAt: null,
    lockedAt: null,
    failedAttempts: 0,
    signedAt: null,
    revokedAt: null,
    consentId: null,
    signedIpAddress: null,
    budgetAcceptanceId: null,
    countersignedAt: null,
    ...overrides,
  };
}

const OPTIONS: SignatureRequestOptions = {
  templates: [],
  professionals: [],
  defaultProfessionalId: null,
  plans: [],
  recipient: {
    allowed: true,
    reason: null,
    destinationMasked: 'ma***@example.com',
    signerType: 'PATIENT',
    signerName: 'Marta Ríos',
    minor: false,
  },
};

function renderActions(p: TreatmentPlan, role: 'DENTIST' | 'ASSISTANT' | 'RECEPTION' = 'DENTIST') {
  render(<PlanQuoteActions token="tok" patientId="p1" plan={p} role={role} onAccepted={jest.fn()} />);
}

describe('Enviar a aceptar el presupuesto (DX-415)', () => {
  beforeEach(() => {
    [mockedList, mockedOptions, mockedCreate].forEach((m) => m.mockReset());
  });

  it('presentado: confirma con el destinatario enmascarado, envía el BUDGET del plan y muestra el estado', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedOptions.mockResolvedValue(OPTIONS);
    mockedCreate.mockResolvedValue({ ...budgetRequest({ status: 'SENT', openedAt: null }), emailQueued: true });
    renderActions(plan());
    await user.click(await screen.findByRole('button', { name: 'Enviar a aceptar' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('ma***@example.com · acepta Marta Ríos (paciente)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar a aceptar' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
        type: 'BUDGET',
        channel: 'EMAIL',
        treatmentPlanId: 'plan-1',
      }),
    );
    expect(await screen.findByText(/Enviado a aceptar a ma\*\*\*@example\.com .* Enviado$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar de nuevo' })).toBeInTheDocument();
  });

  it('muestra el estado del último enlace del plan y avisa de que reenviar anula el anterior', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([budgetRequest({ treatmentPlanId: 'otro' }), budgetRequest()]);
    mockedOptions.mockResolvedValue(OPTIONS);
    renderActions(plan());
    expect(await screen.findByText(/· Abierto$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar de nuevo' }));
    expect(await screen.findByText(/el anterior deja de servir/)).toBeInTheDocument();
  });

  it('sin email o con baja: dice por qué y no deja enviar', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedOptions.mockResolvedValue({
      ...OPTIONS,
      recipient: { ...OPTIONS.recipient, allowed: false, reason: 'El paciente no tiene email.', destinationMasked: null },
    });
    renderActions(plan());
    await user.click(await screen.findByRole('button', { name: 'Enviar a aceptar' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El paciente no tiene email.');
    expect(within(dialog).getByRole('button', { name: 'Enviar a aceptar' })).toBeDisabled();
  });

  it('error al cargar el estado: lo dice con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce([]);
    renderActions(plan());
    expect(await screen.findByText('No pudimos cargar el estado del envío.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('asistente y recepción no deciden el plan: no hay «Enviar a aceptar» (la API responde 403)', () => {
    renderActions(plan(), 'ASSISTANT');
    renderActions(plan(), 'RECEPTION');
    expect(screen.queryByRole('button', { name: /enviar a aceptar/i })).not.toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('borrador, sin ítems o ya aceptado: no hay «Enviar a aceptar»', () => {
    renderActions(plan({ status: 'DRAFT' }));
    renderActions(plan({ items: [] }));
    expect(screen.queryByRole('button', { name: /enviar a aceptar/i })).not.toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('aceptado a distancia: «Aceptado a distancia» con las evidencias', () => {
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptance: {
          signerName: 'Marta Ríos',
          acceptedAt: '2026-10-30T15:00:00.000Z',
          remote: {
            destinationMasked: 'ma***@example.com',
            sentAt: '2026-10-30T14:00:00.000Z',
            openedAt: '2026-10-30T14:05:00.000Z',
            verifiedAt: '2026-10-30T14:06:00.000Z',
            ipAddress: '203.0.113.7',
          },
        },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^Aceptado a distancia por Marta Ríos el /);
    const evidence = screen.getByLabelText('Evidencias de la aceptación a distancia');
    expect(evidence).toHaveTextContent('ma***@example.com');
    expect(evidence).toHaveTextContent('203.0.113.7');
    expect(evidence).toHaveTextContent('Código verificado');
    // 14:06 UTC = 10:06 a. m. en Caracas.
    return waitFor(() => expect(evidence).toHaveTextContent(/10:06.*a\. m\./));
    expect(screen.queryByRole('button', { name: /enviar a aceptar/i })).not.toBeInTheDocument();
  });
});
