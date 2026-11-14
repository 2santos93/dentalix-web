import { render, screen, waitFor, within } from '@testing-library/react';
import { clearSessionStore } from '@/lib/session/session-store';
import userEvent from '@testing-library/user-event';
import { DiscountPolicyManager } from './discount-policy-manager';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { dateTimeIn, STAMP_SEDES } from '@/lib/test/stamp';
import { getDiscountPolicy, updateDiscountPolicy, type DiscountPolicy } from '@/lib/discounts/discounts-api';

jest.mock('../../lib/discounts/discounts-api', () => ({
  getDiscountPolicy: jest.fn(),
  updateDiscountPolicy: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedGet = getDiscountPolicy as jest.MockedFunction<typeof getDiscountPolicy>;
const mockedUpdate = updateDiscountPolicy as jest.MockedFunction<typeof updateDiscountPolicy>;

const DEFAULT: DiscountPolicy = {
  maxPercentByRole: { ADMIN: 100, DENTIST: 10, ASSISTANT: 0, RECEPTION: 0 },
  reasonRequiredAbovePercent: 10,
  isDefault: true,
  updatedAt: null,
  updatedById: null,
};

describe('DiscountPolicyManager (DX-204)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedLocations.mockReset().mockResolvedValue([STAMP_SEDES.caracas]);
  });

  it('sin permiso: el aviso, sin pedir nada a la API', () => {
    render(<DiscountPolicyManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia los topes de descuento.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('muestra el tope de cada rol y el umbral del motivo', async () => {
    mockedGet.mockResolvedValue(DEFAULT);
    render(<DiscountPolicyManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Tope de descuento por rol' });
    expect(within(table).getByText('Odontólogo')).toBeInTheDocument();
    expect(within(table).getByText('10 %')).toBeInTheDocument();
    expect(screen.getByText('Motivo obligatorio por encima del 10 %.')).toBeInTheDocument();
    expect(screen.getByText('Valores por defecto')).toBeInTheDocument();
  });

  it('la marca «Valores por defecto» no va dentro de un <p> (HTML válido, sin error de hidratación)', async () => {
    mockedGet.mockResolvedValue(DEFAULT);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<DiscountPolicyManager token="tok" allowed />);
      const badge = await screen.findByText('Valores por defecto');
      expect(badge.closest('p')).toBeNull();
      const nesting = consoleError.mock.calls.filter((args) => String(args[0]).includes('cannot be a descendant of'));
      expect(nesting).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('edita los topes en un modal, valida 0..100 y guarda', async () => {
    mockedGet.mockResolvedValue(DEFAULT);
    mockedUpdate.mockResolvedValue({
      ...DEFAULT,
      maxPercentByRole: { ...DEFAULT.maxPercentByRole, DENTIST: 20 },
      isDefault: false,
      updatedAt: '2026-10-17T15:00:00.000Z',
    });
    render(<DiscountPolicyManager token="tok" allowed />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar los topes de descuento' }));
    const dialog = screen.getByRole('dialog');
    const dentist = within(dialog).getByLabelText('Tope de odontólogo (%)');
    await userEvent.clear(dentist);
    await userEvent.type(dentist, '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Escribe un número entero entre 0 y 100.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();

    await userEvent.clear(dentist);
    await userEvent.type(dentist, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', {
        maxPercentByRole: { ADMIN: 100, DENTIST: 20, ASSISTANT: 0, RECEPTION: 0 },
        reasonRequiredAbovePercent: 10,
      }),
    );
    expect(await screen.findByText('20 %', { selector: 'td' })).toBeInTheDocument();
  });

  describe('«Cambiada el …» con el formato de la sede (DX-354b)', () => {
    const CHANGED: DiscountPolicy = { ...DEFAULT, isDefault: false, updatedAt: '2026-10-17T02:30:00.000Z', updatedById: 'u1' };

    it('Caracas (12 h) y Berlín (24 h): la misma entrada, dos salidas', async () => {
      mockedGet.mockResolvedValue(CHANGED);
      const { unmount } = render(<DiscountPolicyManager token="tok" allowed />);
      expect(await screen.findByText(`Cambiada el ${dateTimeIn('caracas', CHANGED.updatedAt!)}.`)).toBeInTheDocument();
      unmount();
      clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
      mockedLocations.mockResolvedValue([STAMP_SEDES.berlin]);
      render(<DiscountPolicyManager token="tok" allowed />);
      expect(await screen.findByText(`Cambiada el ${dateTimeIn('berlin', CHANGED.updatedAt!)}.`)).toBeInTheDocument();
      expect(dateTimeIn('berlin', CHANGED.updatedAt!)).not.toBe(dateTimeIn('caracas', CHANGED.updatedAt!));
    });

    it('sin formato de la sede: «—» y un solo aviso; cargando, «—» sin aviso', async () => {
      mockedGet.mockResolvedValue(CHANGED);
      mockedLocations.mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
      render(<DiscountPolicyManager token="tok" allowed />);
      expect(await screen.findByText('Cambiada el —.')).toBeInTheDocument();
      expect(screen.getAllByText(/No se pudo saber el formato regional o el reloj de la sede/)).toHaveLength(1);
    });

    it('mientras cargan las sedes: «—» sin aviso', async () => {
      mockedGet.mockResolvedValue(CHANGED);
      mockedLocations.mockReturnValue(new Promise(() => undefined));
      render(<DiscountPolicyManager token="tok" allowed />);
      expect(await screen.findByText('Cambiada el —.')).toBeInTheDocument();
      expect(screen.queryByText(/No se pudo saber el formato regional/)).not.toBeInTheDocument();
    });
  });
});
