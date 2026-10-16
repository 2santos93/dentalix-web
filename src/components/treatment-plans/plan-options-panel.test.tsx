import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanOptionsPanel } from './plan-options-panel';
import { presentPlan, rejectPlan, createPlanAlternative } from '@/lib/treatment-plans/plan-options-api';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { ApiError } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';

jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  presentPlan: jest.fn(),
  rejectPlan: jest.fn(),
  createPlanAlternative: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  getPlan: jest.fn(),
}));

const mockedPresent = presentPlan as jest.MockedFunction<typeof presentPlan>;
const mockedReject = rejectPlan as jest.MockedFunction<typeof rejectPlan>;
const mockedCreate = createPlanAlternative as jest.MockedFunction<typeof createPlanAlternative>;
const mockedGetPlan = getPlan as jest.MockedFunction<typeof getPlan>;

function plan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'a',
    tenantId: 't1',
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'COP',
    notes: null,
    createdById: null,
    optionGroupId: null,
    optionLabel: null,
    presentedAt: null,
    presentedLocationId: null,
    rejectedAt: null,
    rejectionReason: null,
    rejectionNote: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [{}] as never,
    total: 100,
    ...overrides,
  };
}

function renderPanel(p: TreatmentPlan, role: ClinicRole, group: TreatmentPlan[] = []) {
  const props = {
    token: 'tok',
    plan: p,
    group,
    role,
    onChanged: jest.fn().mockResolvedValue(undefined),
    onSelectPlan: jest.fn(),
  };
  render(<PlanOptionsPanel {...props} />);
  return props;
}

describe('PlanOptionsPanel (DX-040)', () => {
  beforeEach(() => {
    mockedPresent.mockReset();
    mockedReject.mockReset();
    mockedCreate.mockReset();
    mockedGetPlan.mockReset();
  });

  it('el odontólogo presenta un borrador con ítems y el padre recarga', async () => {
    const user = userEvent.setup();
    mockedPresent.mockResolvedValue(plan({ status: 'PRESENTED' }));
    const props = renderPanel(plan(), 'DENTIST');
    await user.click(screen.getByRole('button', { name: 'Presentar al paciente' }));
    expect(mockedPresent).toHaveBeenCalledWith('tok', 'a');
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
  });

  it('si presentar falla, lo dice junto al botón', async () => {
    const user = userEvent.setup();
    mockedPresent.mockRejectedValue(
      new ApiError(400, 'El plan no tiene ítems: agrega al menos un procedimiento antes de presentarlo.'),
    );
    renderPanel(plan(), 'ADMIN');
    await user.click(screen.getByRole('button', { name: 'Presentar al paciente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El plan no tiene ítems');
  });

  it('la asistente ve el plan pero no lo presenta ni lo rechaza; sí crea alternativas', () => {
    renderPanel(plan(), 'ASSISTANT');
    expect(screen.queryByRole('button', { name: 'Presentar al paciente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear alternativa' })).toBeInTheDocument();
    renderPanel(plan({ id: 'p', status: 'PRESENTED' }), 'ASSISTANT');
    expect(screen.queryByRole('button', { name: 'Marcar rechazado' })).not.toBeInTheDocument();
  });

  it('un plan presentado dice cuándo y se puede marcar rechazado (modal con motivo)', async () => {
    const user = userEvent.setup();
    mockedReject.mockResolvedValue(plan({ status: 'REJECTED' }));
    const props = renderPanel(
      plan({ status: 'PRESENTED', presentedAt: '2026-10-07T15:00:00.000Z', optionLabel: 'Opción A' }),
      'DENTIST',
    );
    expect(screen.getByText('Presentado al paciente el 07/10/2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    await user.click(await screen.findByRole('radio', { name: 'Precio' }));
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(mockedReject).toHaveBeenCalledWith('tok', 'a', { reason: 'PRICE' });
  });

  it('un plan rechazado enseña el motivo y la nota', () => {
    renderPanel(
      plan({
        status: 'REJECTED',
        rejectedAt: '2026-10-10T15:00:00.000Z',
        rejectionReason: 'OTHER',
        rejectionNote: 'Se muda de ciudad',
      }),
      'DENTIST',
    );
    expect(screen.getByText('Rechazado el 10/10/2026 · Otro')).toBeInTheDocument();
    expect(screen.getByText('Se muda de ciudad')).toBeInTheDocument();
  });

  it('crear alternativa abre el modal, y al crearla se recarga y se abre la nueva', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(plan({ id: 'b', optionGroupId: 'a', optionLabel: 'Opción B' }));
    const props = renderPanel(plan(), 'DENTIST');
    await user.click(screen.getByRole('button', { name: 'Crear alternativa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear alternativa' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Crear alternativa' }).at(-1)!);
    await waitFor(() => expect(props.onSelectPlan).toHaveBeenCalledWith('b'));
    expect(props.onChanged).toHaveBeenCalled();
  });

  it('con una opción del grupo ya aceptada no ofrece más alternativas', () => {
    const a = plan({ optionGroupId: 'a', status: 'REJECTED' });
    const b = plan({ id: 'b', optionGroupId: 'a', status: 'ACCEPTED' });
    mockedGetPlan.mockResolvedValue(plan());
    renderPanel(a, 'DENTIST', [a, b]);
    expect(screen.queryByRole('button', { name: 'Crear alternativa' })).not.toBeInTheDocument();
  });

  it('con dos o más opciones en el grupo, enseña la comparación', async () => {
    const a = plan({ optionGroupId: 'a', optionLabel: 'Opción A' });
    const b = plan({ id: 'b', optionGroupId: 'a', optionLabel: 'Opción B' });
    mockedGetPlan.mockImplementation((_t, id) => Promise.resolve(id === 'a' ? a : b));
    renderPanel(a, 'DENTIST', [a, b]);
    expect(await screen.findByRole('heading', { name: 'Comparar opciones' })).toBeInTheDocument();
  });
});
