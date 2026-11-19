import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalAcceptDialog, portalAcceptCopy as copy } from './portal-accept-dialog';
import { planQuoteFixture } from '@/components/treatment-plans/plan-quote-fixture';
import type { PortalPlan } from '@/lib/patient-access/patient-access-api';

// jsdom no implementa canvas: contexto 2D simulado (la firma escrita y el
// lienzo de «Dibujar») y `toDataURL` que dice de qué lienzo sale el PNG.
const ctx = {
  setTransform: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fillText: jest.fn(),
  measureText: jest.fn(() => ({ width: 200 })),
  font: '',
  fillStyle: '',
  textBaseline: '',
  textAlign: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
  strokeStyle: '',
};

let getContext: jest.SpyInstance;
beforeAll(() => {
  getContext = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    // El lienzo de «Dibujar» está en el documento; el de la firma escrita no.
    return this.isConnected ? 'data:image/png;base64,DIBUJADA' : 'data:image/png;base64,ESCRITA';
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  getContext.mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
});

function plan(over: Partial<PortalPlan> = {}): PortalPlan {
  return {
    id: 'plan-b',
    status: 'PRESENTED',
    optionGroupId: null,
    optionLabel: null,
    acceptable: true,
    validUntil: '2026-12-18',
    contentHash: 'c'.repeat(64),
    acceptedAt: null,
    quote: planQuoteFixture({ currency: 'USD' }),
    ...over,
  };
}

function renderDialog(props: Partial<React.ComponentProps<typeof PortalAcceptDialog>> = {}) {
  const onSubmit = jest.fn();
  const onOpenChange = jest.fn();
  const utils = render(
    <PortalAcceptDialog
      open
      onOpenChange={onOpenChange}
      plan={plan()}
      optionLabel={null}
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...utils, onSubmit, onOpenChange };
}

test('resumen (plan, total y validez), «Escribir mi nombre» por defecto y el foco dentro del diálogo', () => {
  renderDialog();
  const dialog = screen.getByRole('dialog', { name: copy.titleSingle });
  const summary = within(dialog).getByRole('region', { name: copy.summary });
  expect(summary).toHaveTextContent('Presupuesto · ');
  expect(summary).toHaveTextContent(/Total \(VES\)VES 3.300.000,00/);
  expect(summary).toHaveTextContent('Válido hasta el 18/12/2026');
  expect(within(dialog).getByRole('radio', { name: copy.modeType })).toHaveAttribute('aria-checked', 'true');
  expect(within(dialog).getByText(copy.previewEmpty)).toBeInTheDocument();
  expect(dialog.contains(document.activeElement)).toBe(true);
});

test('A/B: el título dice qué opción se elige', () => {
  renderDialog({ optionLabel: 'Opción B' });
  expect(screen.getByRole('dialog', { name: 'Elegir la opción B' })).toBeInTheDocument();
});

test('sin casilla ni nombre no envía y lo dice junto a cada campo', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderDialog();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(screen.getByText(copy.consentRequired)).toBeInTheDocument();
  expect(screen.getByText(copy.signerRequired)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('solo con el teclado: casilla con Espacio, nombre, vista previa y Enter envía la firma escrita', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderDialog();
  const consent = screen.getByRole('checkbox', { name: copy.consent });
  consent.focus();
  await user.keyboard(' ');
  expect(consent).toBeChecked();
  await user.tab();
  expect(screen.getByLabelText(copy.signerName, { exact: true })).toHaveFocus();
  await user.keyboard('  María José Pérez ');
  const preview = screen.getByRole('img', { name: copy.previewAlt('María José Pérez') });
  expect(preview).toHaveAttribute('src', 'data:image/png;base64,ESCRITA');
  expect(ctx.fillText).toHaveBeenCalledWith('María José Pérez', expect.any(Number), expect.any(Number), expect.any(Number));
  expect(ctx.font).toMatch(/cursive/);
  await user.keyboard('{Enter}');
  expect(onSubmit).toHaveBeenCalledWith({ signerName: 'María José Pérez', signature: 'data:image/png;base64,ESCRITA' });
});

test('«Dibujar»: sin trazo no envía; con trazo envía el PNG del lienzo', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderDialog();
  await user.click(screen.getByRole('checkbox', { name: copy.consent }));
  await user.type(screen.getByLabelText(copy.signerName, { exact: true }), 'Ana Pérez');
  // Las flechas eligen en el control segmentado (radio).
  screen.getByRole('radio', { name: copy.modeType }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('radio', { name: copy.modeDraw })).toHaveAttribute('aria-checked', 'true');
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(screen.getByText(copy.drawRequired)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();

  const canvas = screen.getByRole('img', { name: copy.drawLabel });
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1, pointerType: 'mouse', buttons: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1, pointerType: 'mouse', buttons: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse' });
  expect(screen.queryByText(copy.drawRequired)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(onSubmit).toHaveBeenCalledWith({ signerName: 'Ana Pérez', signature: 'data:image/png;base64,DIBUJADA' });
});

test('sin lienzo 2D, la firma escrita no se puede generar: lo dice y pide «Dibujar»', async () => {
  getContext.mockImplementation(() => null);
  const user = userEvent.setup();
  const { onSubmit } = renderDialog();
  await user.click(screen.getByRole('checkbox', { name: copy.consent }));
  await user.type(screen.getByLabelText(copy.signerName, { exact: true }), 'Ana');
  expect(screen.getByText(copy.previewUnsupported)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('Escape cierra; mientras envía, el principal queda bloqueado y no se cierra', async () => {
  const user = userEvent.setup();
  const { onOpenChange, rerender, onSubmit } = renderDialog();
  await user.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);

  onOpenChange.mockClear();
  rerender(
    <PortalAcceptDialog
      open
      onOpenChange={onOpenChange}
      plan={plan()}
      optionLabel={null}
      submitting
      error={null}
      onSubmit={onSubmit}
    />,
  );
  const submit = screen.getByRole('button', { name: copy.submit });
  expect(submit).toHaveAttribute('aria-busy', 'true');
  await user.click(submit);
  expect(onSubmit).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  expect(onOpenChange).not.toHaveBeenCalled();
});

test('el fallo del envío se ve arriba del formulario', () => {
  renderDialog({ error: 'No pudimos registrar tu aceptación. Revisa tu conexión e intenta de nuevo.' });
  expect(screen.getByText('No pudimos registrar tu aceptación. Revisa tu conexión e intenta de nuevo.')).toBeInTheDocument();
});
