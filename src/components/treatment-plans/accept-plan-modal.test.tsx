import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearSessionStore } from '@/lib/session/session-store';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { AcceptPlanModal } from './accept-plan-modal';
import {
  acceptPlan,
  getPlanQuote,
  previewAcceptanceRepricing,
  type AcceptanceRepricePreview,
} from '@/lib/treatment-plans/plan-quote-api';
import type { ClinicRole } from '@/lib/me/me-api';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
  getPlan: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  acceptPlan: jest.fn(),
  previewAcceptanceRepricing: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;
const mockedAccept = acceptPlan as jest.MockedFunction<typeof acceptPlan>;
const mockedRepricePreview = jest.mocked(previewAcceptanceRepricing);

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(() => 'data:image/png;base64,FIRMA');
});

function sign(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

function renderModal(extra: { quoteExpired?: boolean; role?: ClinicRole } = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onAccepted: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    planId: 'plan-1',
    role: 'DENTIST' as ClinicRole,
    locationId: 'loc-1',
    ...extra,
  };
  render(<AcceptPlanModal {...props} />);
  return props;
}

describe('AcceptPlanModal (DX-012)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale: 'es-VE' })]);
    mockedAccept.mockReset();
  });

  it('DX-354b: la vigencia sale con el formato de la sede (de-DE, en-US) y sin formato dice «—» con el aviso', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    for (const [locale, hourCycle] of [['de-DE', 'h23'], ['en-US', 'h12']] as const) {
      (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale, hourCycle })]);
      renderModal();
      const dialog = screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
      const summary = await within(dialog).findByRole('region', { name: 'Presupuesto a firmar' });
      const day = regionalFormat({ locale, hourCycle }).civilDate('2026-11-15');
      await waitFor(() => expect(summary).toHaveTextContent(`Válido 30 días, hasta el ${day}`));
      cleanup();
      clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
    }
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    const summary = await within(dialog).findByRole('region', { name: 'Presupuesto a firmar' });
    expect(summary).toHaveTextContent('Válido 30 días, hasta el —');
    expect(await within(dialog).findByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
  });

  it('enseña lo que se va a firmar: procedimientos, total y validez', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Cargando el presupuesto…');
    const summary = await within(dialog).findByRole('region', { name: 'Presupuesto a firmar' });
    expect(summary).toHaveTextContent('Implante');
    expect(summary).toHaveTextContent('Diente 36');
    expect(summary).toHaveTextContent('Resina');
    // DX-522: importes con el código ISO y el formato de la sede.
    await waitFor(() => expect((summary.textContent ?? '').replace(/\s/g, ' ')).toContain('VES 3.300.000,00'));
    expect((summary.textContent ?? '').replace(/\s/g, ' ')).toContain('VES 3.150.000,00');
    expect(summary).toHaveTextContent('Válido 30 días, hasta el 15/11/2026');
    expect(within(dialog).getByRole('link', { name: /Ver el presupuesto completo/ })).toHaveAttribute(
      'href',
      '/print/patients/p1/treatment-plans/plan-1',
    );
    expect(within(dialog).getByLabelText('Nombre de quien firma')).toHaveValue('Ana Pérez');
  });

  it('sin firma no se puede aceptar; con firma envía nombre, firma y el hash mostrado', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(planQuoteFixture());
    const accepted = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedAccept.mockResolvedValue(accepted);
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    const submit = screen.getByRole('button', { name: 'Aceptar y firmar' });
    expect(submit).toBeDisabled();

    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    expect(submit).toBeEnabled();
    await user.clear(screen.getByLabelText('Nombre de quien firma'));
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Nombre de quien firma'), 'Ana María Pérez');
    await user.click(submit);

    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana María Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'c'.repeat(64),
    });
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(accepted));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('409 (el presupuesto cambió): explica y recarga lo que se muestra', async () => {
    const user = userEvent.setup();
    mockedGet
      .mockResolvedValueOnce(planQuoteFixture())
      .mockResolvedValueOnce(planQuoteFixture({ contentHash: 'e'.repeat(64) }));
    mockedAccept.mockRejectedValue(
      new ApiError(409, 'El presupuesto cambió desde que se mostró: revísalo de nuevo con el paciente antes de firmar.'),
    );
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El presupuesto cambió');
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(props.onAccepted).not.toHaveBeenCalled();
    // La firma se pide de nuevo sobre el presupuesto recargado.
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
  });

  it('409 porque otro ya lo firmó: cierra el modal y avisa al plan con la aceptación', async () => {
    const user = userEvent.setup();
    const signed = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedGet.mockResolvedValueOnce(planQuoteFixture()).mockResolvedValueOnce(signed);
    mockedAccept.mockRejectedValue(
      new ApiError(409, 'El plan ya fue aceptado y firmado: no se puede volver a firmar.'),
    );
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(signed));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un error genérico al firmar deja la firma y se puede reintentar', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(planQuoteFixture());
    mockedAccept.mockRejectedValueOnce(new Error('network'));
    renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar la aceptación. Intenta de nuevo.',
    );
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeEnabled();
  });

  it('si el presupuesto no carga: error con reintento y sin poder firmar', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(planQuoteFixture());
    renderModal();
    expect(await screen.findByText('No pudimos cargar el presupuesto.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Presupuesto a firmar' })).toBeInTheDocument();
  });
});

/** axe estructural en jsdom (sin colores ni geometría: los cubre el e2e). */
async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const REPRICED_HASH = 'f'.repeat(64);
const PREVIEW_HASH = 'a'.repeat(64);

function repricePreview(overrides: Partial<AcceptanceRepricePreview['repricing']> = {}): AcceptanceRepricePreview {
  const price = (total: number) => ({
    price: total,
    discount: 0,
    total,
    listPrice: total,
    priceSource: 'CATALOG' as const,
    agreementId: null,
    agreementName: null,
  });
  return {
    repricing: {
      planId: 'plan-1',
      currency: 'VES',
      previewHash: PREVIEW_HASH,
      lines: [
        { itemId: 'i1', catalogItemId: 'c1', toothNumber: '36', before: price(3150000), after: price(3400000), difference: 250000, changed: true },
      ],
      skipped: [],
      rate: null,
      previousValidity: { issuedOn: '2026-10-16', validUntil: '2026-11-15' },
      validityRenewed: true,
      validityNote: null,
      validity: { issuedOn: '2026-11-20', validUntil: '2026-12-20' },
      totals: { before: 3300000, after: 3550000, difference: 250000 },
      ...overrides,
    },
    quote: planQuoteFixture({
      issuedOn: '2026-11-20',
      validUntil: '2026-12-20',
      contentHash: REPRICED_HASH,
      totals: [{ currency: 'VES', gross: 3900000, discount: 350000, net: 3550000, agreementSaving: 0 }],
    }),
  };
}

describe('AcceptPlanModal — presupuesto vencido (DX-379 C)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedAccept.mockReset();
    mockedRepricePreview.mockReset();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ id: 'loc-1', locale: 'es-VE' })]);
    mockedGet.mockResolvedValue(planQuoteFixture());
  });

  it('sin vencer no hay paso de elección: directo a la firma, sin `expired`', async () => {
    renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    expect(screen.queryByRole('radiogroup', { name: 'Cómo aceptarlo' })).not.toBeInTheDocument();
    expect(screen.queryByText(/venció/)).not.toBeInTheDocument();
    expect(mockedRepricePreview).not.toHaveBeenCalled();
  });

  it('vencido: primero el paso «El presupuesto venció el …» con la opción recomendada marcada, sin axe', async () => {
    renderModal({ quoteExpired: true });
    const dialog = screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    const group = await within(dialog).findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await waitFor(() => expect(within(dialog).getByText('El presupuesto venció el 15/11/2026')).toBeInTheDocument());
    expect(within(group).getByRole('radio', { name: /Actualizar los precios y aceptar/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /Aceptar con los precios originales/ })).not.toBeChecked();
    expect(within(dialog).queryByRole('img', { name: 'Firma del paciente' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeEnabled();
    expect(mockedRepricePreview).not.toHaveBeenCalled();
    expect(await violations(dialog)).toEqual([]);
  });

  it('actualizar precios: pide la vista previa, enseña la recotización y firma con sus dos huellas', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockResolvedValue(repricePreview());
    const accepted = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedAccept.mockResolvedValue(accepted);
    const props = renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const dialog = screen.getByRole('dialog');
    const repricedSummary = await within(dialog).findByRole('region', {
      name: 'Presupuesto con los precios actualizados, a firmar',
    });
    expect(mockedRepricePreview).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    expect(within(dialog).getByRole('region', { name: 'Totales del plan' })).toBeInTheDocument();
    // La línea recotizada se nombra con el procedimiento del presupuesto.
    expect(within(dialog).getAllByLabelText('Procedimientos a actualizar')[0]).toHaveTextContent('Implante');
    await waitFor(() => expect((repricedSummary.textContent ?? '').replace(/\s/g, ' ')).toContain('VES 3.550.000,00'));
    expect(repricedSummary).toHaveTextContent('hasta el 20/12/2026');
    expect(within(repricedSummary).queryByRole('link')).not.toBeInTheDocument();
    expect(await violations(dialog)).toEqual([]);

    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: REPRICED_HASH,
      expired: { mode: 'REPRICE', repricePreviewHash: PREVIEW_HASH },
    });
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(accepted));
  });

  it('REPRICE_PREVIEW_STALE al firmar: vuelve a pedir la vista previa y pide la firma de nuevo', async () => {
    const user = userEvent.setup();
    mockedRepricePreview
      .mockResolvedValueOnce(repricePreview())
      .mockResolvedValueOnce(repricePreview({ previewHash: 'b'.repeat(64) }));
    mockedAccept.mockRejectedValueOnce(
      new ApiError(409, 'Los precios vigentes cambiaron desde la vista previa: revísala de nuevo.', {
        code: 'REPRICE_PREVIEW_STALE',
      }),
    );
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Presupuesto con los precios actualizados, a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Los precios vigentes cambiaron');
    await waitFor(() => expect(mockedRepricePreview).toHaveBeenCalledTimes(2));
    await screen.findByRole('region', { name: 'Presupuesto con los precios actualizados, a firmar' });
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    mockedAccept.mockResolvedValueOnce(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(mockedAccept).toHaveBeenLastCalledWith(
      'tok',
      'p1',
      'plan-1',
      expect.objectContaining({ expired: { mode: 'REPRICE', repricePreviewHash: 'b'.repeat(64) } }),
    );
  });

  it.each([
    ['REPRICE_INCOMPLETE', 409, 'Algún procedimiento no tiene precio vigente: no se pueden actualizar todos los precios.'],
    ['REPRICE_NOTHING_TO_APPLY', 409, 'No hay precios que actualizar en este presupuesto.'],
    [null, 403, 'El redondeo supera el descuento máximo que puedes aplicar.'],
  ])('%s (%s) en la vista previa: vuelve a la elección con el mensaje y sugiere los precios originales', async (code, status, message) => {
    const user = userEvent.setup();
    mockedRepricePreview.mockRejectedValue(new ApiError(status, message, { code }));
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent('Puedes aceptarlo con los precios originales indicando el motivo.');
    const group = screen.getByRole('radiogroup', { name: 'Cómo aceptarlo' });
    expect(within(group).queryByRole('radio', { name: /Actualizar los precios/ })).not.toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: /Aceptar con los precios originales/ })).not.toBeChecked();
  });

  it('un fallo de red en la vista previa se reintenta en el paso de la firma', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(repricePreview());
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('No pudimos calcular los precios vigentes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('region', { name: 'Presupuesto con los precios actualizados, a firmar' }),
    ).toBeInTheDocument();
  });

  it('precios originales: exige motivo; con «Otro», la nota; firma con el hash de siempre, motivo y nota', async () => {
    const user = userEvent.setup();
    mockedAccept.mockResolvedValue(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('radio', { name: /Aceptar con los precios originales/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Elige el motivo para aceptarlo con los precios originales.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');

    await user.selectOptions(screen.getByLabelText('Motivo'), 'OTHER');
    expect(screen.getByLabelText('Nota')).toHaveAttribute('aria-required', 'true');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(
      screen.getByText('Con el motivo «Otro», escribe una nota (hasta 200 caracteres).'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nota'), 'Precio pactado en la consulta');
    expect(screen.getByText('29 de 200 caracteres')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota')).toHaveAttribute('maxLength', '200');
    expect(await violations(screen.getByRole('dialog'))).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('region', { name: 'Presupuesto a firmar' })).toBeInTheDocument();
    expect(screen.getByTestId('accept-original-reason')).toHaveTextContent(
      'Se acepta con los precios del presupuesto vencido. Motivo: Otro.',
    );
    expect(mockedRepricePreview).not.toHaveBeenCalled();
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'c'.repeat(64),
      expired: { mode: 'ORIGINAL_PRICES', reason: 'OTHER', note: 'Precio pactado en la consulta' },
    });
  });

  it('precios originales con un motivo del catálogo: la nota es opcional y no se envía vacía', async () => {
    const user = userEvent.setup();
    mockedAccept.mockResolvedValue(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('radio', { name: /Aceptar con los precios originales/ }));
    expect(screen.getByLabelText('Nota (opcional)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Motivo'), 'LOYALTY');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(mockedAccept).toHaveBeenCalledWith(
      'tok',
      'p1',
      'plan-1',
      expect.objectContaining({ expired: { mode: 'ORIGINAL_PRICES', reason: 'LOYALTY' } }),
    );
  });

  it('409 QUOTE_EXPIRED que la web no sabía (venció con el modal abierto): retrocede a la elección con el mensaje', async () => {
    const user = userEvent.setup();
    mockedAccept.mockRejectedValueOnce(
      new ApiError(
        409,
        'El presupuesto venció el 15/11/2026. Actualiza los precios o acepta con los precios originales indicando el motivo.',
        { code: 'QUOTE_EXPIRED' },
      ),
    );
    renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El presupuesto venció el 15/11/2026.');
    expect(await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));

    // Y la siguiente firma ya lleva cómo.
    mockedAccept.mockResolvedValueOnce(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    await user.click(screen.getByRole('radio', { name: /Aceptar con los precios originales/ }));
    await user.selectOptions(screen.getByLabelText('Motivo'), 'CLINIC_DELAY');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(mockedAccept).toHaveBeenLastCalledWith(
      'tok',
      'p1',
      'plan-1',
      expect.objectContaining({ expired: { mode: 'ORIGINAL_PRICES', reason: 'CLINIC_DELAY' } }),
    );
  });

  it.each(['ASSISTANT', 'RECEPTION'] as const)(
    '%s no pide la vista previa (403): solo «precios originales»',
    async (role) => {
      renderModal({ quoteExpired: true, role });
      const group = await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
      expect(within(group).queryByRole('radio', { name: /Actualizar los precios/ })).not.toBeInTheDocument();
      expect(within(group).getByRole('radio', { name: /Aceptar con los precios originales/ })).toBeInTheDocument();
    },
  );

  it('se puede volver de la firma a la elección por el paso', async () => {
    const user = userEvent.setup();
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('radio', { name: /Aceptar con los precios originales/ }));
    await user.selectOptions(screen.getByLabelText('Motivo'), 'LOYALTY');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    await user.click(screen.getAllByRole('button', { name: /Cómo aceptarlo/ })[0]);
    expect(await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveValue('LOYALTY');
  });
});

describe('AcceptPlanModal — presupuesto vencido, ronda 1 (DX-379 C)', () => {
  const mockedGetPlan = jest.mocked(getPlan);
  const NOT_EXPIRED = 'El presupuesto no está vencido: acéptalo sin elegir cómo.';

  beforeEach(() => {
    mockedGet.mockReset();
    mockedAccept.mockReset();
    mockedRepricePreview.mockReset();
    mockedGetPlan.mockReset();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ id: 'loc-1', locale: 'es-VE' })]);
    mockedGet.mockResolvedValue(planQuoteFixture());
  });

  async function toSign(user: ReturnType<typeof userEvent.setup>, mode: 'REPRICE' | 'ORIGINAL_PRICES') {
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    if (mode === 'ORIGINAL_PRICES') {
      await user.click(screen.getByRole('radio', { name: /Aceptar con los precios originales/ }));
      await user.selectOptions(screen.getByLabelText('Motivo'), 'LOYALTY');
    }
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', {
      name: mode === 'REPRICE' ? 'Presupuesto con los precios actualizados, a firmar' : 'Presupuesto a firmar',
    });
  }

  async function signAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
  }

  it('M-1: 400 «no está vencido» al firmar (otro lo volvió a presentar): pasa a la firma normal y firma sin `expired`', async () => {
    const user = userEvent.setup();
    mockedAccept.mockRejectedValueOnce(new ApiError(400, NOT_EXPIRED));
    mockedGetPlan.mockResolvedValue({ quoteExpired: false, acceptance: null } as unknown as TreatmentPlan);
    renderModal({ quoteExpired: true });
    await toSign(user, 'ORIGINAL_PRICES');
    await signAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El presupuesto ya no está vencido: revísalo con el paciente y fírmalo.',
    );
    expect(mockedGetPlan).toHaveBeenCalledWith('tok', 'plan-1');
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('radiogroup', { name: 'Cómo aceptarlo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();

    mockedAccept.mockResolvedValueOnce(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    await signAndSubmit(user);
    expect(mockedAccept).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'c'.repeat(64),
    });
  });

  it('M-1: 400 «no está vencido» en la vista previa: también pasa a la firma normal', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockRejectedValueOnce(new ApiError(400, NOT_EXPIRED));
    mockedGetPlan.mockResolvedValue({ quoteExpired: false, acceptance: null } as unknown as TreatmentPlan);
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El presupuesto ya no está vencido');
    expect(await screen.findByRole('region', { name: 'Presupuesto a firmar' })).toBeInTheDocument();
    expect(screen.queryByText(/Puedes aceptarlo con los precios originales/)).not.toBeInTheDocument();
  });

  it('M-1: un 400 de validación con el plan aún vencido se enseña tal cual, sin cambiar de paso', async () => {
    const user = userEvent.setup();
    mockedAccept.mockRejectedValueOnce(new ApiError(400, 'La nota del motivo admite hasta 200 caracteres.'));
    mockedGetPlan.mockResolvedValue({ quoteExpired: true, acceptance: null } as unknown as TreatmentPlan);
    renderModal({ quoteExpired: true });
    await toSign(user, 'ORIGINAL_PRICES');
    await signAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('La nota del motivo admite hasta 200 caracteres.');
    expect(screen.getByTestId('accept-original-reason')).toBeInTheDocument();
  });

  it.each([
    ['la vista previa', 'REPRICE' as const],
    ['la firma', 'ORIGINAL_PRICES' as const],
  ])('M-2: LOCATION_TIMEZONE_REQUIRED en %s: el mensaje, sin sugerir los originales y sin botón de enviar', async (_where, mode) => {
    const user = userEvent.setup();
    const error = new ApiError(409, 'La sede no tiene una zona horaria válida: configúrala antes de aceptar.', {
      code: 'LOCATION_TIMEZONE_REQUIRED',
    });
    mockedRepricePreview.mockRejectedValue(error);
    mockedAccept.mockRejectedValue(error);
    renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    if (mode === 'ORIGINAL_PRICES') {
      await toSign(user, mode);
      await signAndSubmit(user);
    } else {
      await user.click(screen.getByRole('button', { name: 'Continuar' }));
    }
    expect(await screen.findByText('No se puede aceptar ahora')).toBeInTheDocument();
    expect(screen.getByText('La sede no tiene una zona horaria válida: configúrala antes de aceptar.')).toBeInTheDocument();
    expect(screen.queryByText(/Puedes aceptarlo con los precios originales/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continuar|Aceptar y firmar/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Cancelar|Cerrar/ }).length).toBeGreaterThan(0);
  });

  it('M-2: 409 sin código en la vista previa y el plan ya firmado por otro: cierra y refresca con esa aceptación', async () => {
    const user = userEvent.setup();
    const signed = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedGet.mockResolvedValueOnce(planQuoteFixture()).mockResolvedValueOnce(signed);
    mockedRepricePreview.mockRejectedValue(
      new ApiError(409, 'El plan ya fue aceptado y firmado: no se puede volver a firmar.'),
    );
    const props = renderModal({ quoteExpired: true });
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(signed));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('M-3: 403 en la FIRMA con «Actualizar precios»: vuelve a la elección sin esa opción y sugiere los originales', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockResolvedValue(repricePreview());
    mockedAccept.mockRejectedValueOnce(
      new ApiError(403, 'El descuento supera el máximo que puedes aplicar.'),
    );
    renderModal({ quoteExpired: true });
    await toSign(user, 'REPRICE');
    await signAndSubmit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Puedes aceptarlo con los precios originales indicando el motivo.');
    const group = screen.getByRole('radiogroup', { name: 'Cómo aceptarlo' });
    expect(within(group).queryByRole('radio', { name: /Actualizar los precios/ })).not.toBeInTheDocument();
  });

  it('M-7: ir a la firma, volver y entrar otra vez con «Actualizar precios»: dos vistas previas y firma con la segunda', async () => {
    const user = userEvent.setup();
    const second = repricePreview({ previewHash: 'b'.repeat(64) });
    second.quote = { ...second.quote, contentHash: 'e'.repeat(64) };
    mockedRepricePreview.mockResolvedValueOnce(repricePreview()).mockResolvedValueOnce(second);
    mockedAccept.mockResolvedValue(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    renderModal({ quoteExpired: true });
    await toSign(user, 'REPRICE');
    await user.click(screen.getAllByRole('button', { name: /Cómo aceptarlo/ })[0]);
    await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Presupuesto con los precios actualizados, a firmar' });
    await waitFor(() => expect(mockedRepricePreview).toHaveBeenCalledTimes(2));
    await signAndSubmit(user);
    expect(mockedAccept).toHaveBeenCalledWith(
      'tok',
      'p1',
      'plan-1',
      expect.objectContaining({
        contentHash: 'e'.repeat(64),
        expired: { mode: 'REPRICE', repricePreviewHash: 'b'.repeat(64) },
      }),
    );
  });

  it('M-7: 409 sin código en la firma con «Actualizar precios» (el presupuesto cambió): otra vista previa, sin bloquear', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockResolvedValue(repricePreview());
    mockedAccept.mockRejectedValueOnce(
      new ApiError(409, 'El presupuesto cambió desde que se mostró: revísalo de nuevo con el paciente antes de firmar.'),
    );
    renderModal({ quoteExpired: true });
    await toSign(user, 'REPRICE');
    await signAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('El presupuesto cambió');
    await waitFor(() => expect(mockedRepricePreview).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('region', { name: 'Presupuesto con los precios actualizados, a firmar' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Puedes aceptarlo con los precios originales/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
  });

  it('M-7: REPRICE_INCOMPLETE en la firma: vuelve a la elección con la sugerencia', async () => {
    const user = userEvent.setup();
    mockedRepricePreview.mockResolvedValue(repricePreview());
    mockedAccept.mockRejectedValueOnce(
      new ApiError(409, 'Algún procedimiento no tiene precio vigente: no se pueden actualizar todos los precios.', {
        code: 'REPRICE_INCOMPLETE',
      }),
    );
    renderModal({ quoteExpired: true });
    await toSign(user, 'REPRICE');
    await signAndSubmit(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Algún procedimiento no tiene precio vigente');
    expect(alert).toHaveTextContent('Puedes aceptarlo con los precios originales indicando el motivo.');
    const group = screen.getByRole('radiogroup', { name: 'Cómo aceptarlo' });
    expect(within(group).queryByRole('radio', { name: /Actualizar los precios/ })).not.toBeInTheDocument();
  });
});
