import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicalAlertIndicator } from './medical-alert-indicator';
import type { MedicalAlertFlags } from '@/lib/clinical/medical-alerts';

const base: MedicalAlertFlags = {
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'CURRENT',
  alerts: [],
  anamnesisReviewedAt: '2026-09-01T12:00:00.000Z',
};

const premedicated: MedicalAlertFlags = {
  ...base,
  hasCriticalAlert: true,
  requiresPremedication: true,
  alerts: ['profilaxisAntibiotica', 'alergiaLatex'],
};

// jsdom no trae PointerEvent: sin él, `pointerType` se pierde y el ratón no
// se distingue de un toque.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? '';
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

describe('MedicalAlertIndicator (DX-247)', () => {
  it('no pinta nada con la anamnesis al día y sin alertas', () => {
    const { container } = render(<MedicalAlertIndicator flags={base} patientName="Ana" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con alertas: icono rojo con nombre y resumen accesibles', () => {
    render(<MedicalAlertIndicator flags={premedicated} patientName="Ana Ruiz" />);
    const button = screen.getByRole('button', { name: 'Alertas médicas de Ana Ruiz' });
    expect(button).toHaveAttribute('data-severity', 'critical');
    expect(button).toHaveAccessibleDescription(
      'Requiere premedicación · Requiere profilaxis antibiótica · Alergia a látex',
    );
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('sin anamnesis: ámbar y «Sin anamnesis», no «sin alertas»', () => {
    render(
      <MedicalAlertIndicator
        flags={{ ...base, anamnesisStatus: 'MISSING', anamnesisReviewedAt: null }}
        patientName="Leo"
      />,
    );
    const button = screen.getByRole('button', { name: 'Alertas médicas de Leo' });
    expect(button).toHaveAttribute('data-severity', 'attention');
    expect(button).toHaveAccessibleDescription('Sin anamnesis');
  });

  it('con el teclado: enfocar lo abre con las etiquetas del banner y Escape lo cierra sin perder el foco', async () => {
    const user = userEvent.setup();
    render(<MedicalAlertIndicator flags={premedicated} patientName="Ana" />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Alertas médicas de Ana' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const popover = screen.getByTestId('medical-alert-popover');
    expect(button).toHaveAttribute('aria-controls', popover.id);
    expect(popover).toHaveTextContent('Requiere premedicación');
    expect(popover).toHaveTextContent('Requiere profilaxis antibiótica');
    expect(popover).toHaveTextContent('Alergia a látex');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('medical-alert-popover')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('al pasar el ratón se abre y al salir se cierra', async () => {
    jest.useFakeTimers();
    try {
      render(
        <MedicalAlertIndicator
          flags={{ ...base, anamnesisStatus: 'EXPIRED' }}
          patientName="Eva"
        />,
      );
      const button = screen.getByRole('button', { name: 'Alertas médicas de Eva' });
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent(
        'Anamnesis caducada · última revisión 01/09/2026',
      );
      fireEvent.pointerLeave(button, { pointerType: 'mouse' });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('medical-alert-popover')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('al tocarlo queda abierto; tocar fuera lo cierra y el clic no llega a la tarjeta', async () => {
    const user = userEvent.setup();
    const onCard = jest.fn();
    render(
      <div onClick={onCard}>
        <MedicalAlertIndicator flags={premedicated} patientName="Ana" />
        <p>fuera</p>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Alertas médicas de Ana' }));
    expect(screen.getByTestId('medical-alert-popover')).toBeInTheDocument();
    expect(onCard).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText('fuera'));
    expect(screen.queryByTestId('medical-alert-popover')).not.toBeInTheDocument();
  });

  it('disclosure: el panel es un grupo con nombre; con alertas y anamnesis caducada, la nota lleva la carpeta con reloj', async () => {
    const user = userEvent.setup();
    render(
      <MedicalAlertIndicator flags={{ ...premedicated, anamnesisStatus: 'EXPIRED' }} patientName="Ana" />,
    );
    await user.tab();
    const panel = screen.getByRole('group', { name: 'Alertas médicas de Ana' });
    expect(panel).toBe(screen.getByTestId('medical-alert-popover'));
    expect(panel).toHaveTextContent('Anamnesis caducada');
    expect(panel.querySelector('.lucide-clipboard-clock')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Alertas médicas de Ana' }).querySelector('.lucide-triangle-alert')).not.toBeNull();
  });

  it('alerta sin códigos (anamnesis antigua): no se queda callada', async () => {
    const user = userEvent.setup();
    render(<MedicalAlertIndicator flags={{ ...base, hasCriticalAlert: true }} />);
    await user.tab();
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent(
      'Alerta médica registrada (detalle en la ficha)',
    );
  });
});
