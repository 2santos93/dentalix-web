import { render, screen, within } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PatientImplantsTab } from './patient-implants-tab';
import {
  getImplantCatalog,
  listPatientImplants,
  registerImplant,
  voidImplant,
} from '@/lib/implants/implants-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeImplant, tokenFor } from '@/lib/test/implants';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  listPatientImplants: jest.fn(),
  registerImplant: jest.fn(),
  voidImplant: jest.fn(),
  getImplantCatalog: jest.fn(),
}));

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedList = listPatientImplants as jest.MockedFunction<typeof listPatientImplants>;
const mockedRegister = registerImplant as jest.MockedFunction<typeof registerImplant>;
const mockedVoid = voidImplant as jest.MockedFunction<typeof voidImplant>;
const mockedCatalog = getImplantCatalog as jest.MockedFunction<typeof getImplantCatalog>;

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-rec');

describe('PatientImplantsTab (DX-191)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRegister.mockReset();
    mockedVoid.mockReset();
    mockedCatalog.mockReset();
    mockedCatalog.mockResolvedValue([{ manufacturer: 'Straumann', systems: ['BLT'] }]);
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
  });

  it('la medida va con el formato de la sede: en-US «4.1 × 10 mm», de-DE «4,1 × 10 mm»', async () => {
    mockedList.mockResolvedValue([makeImplant()]);
    const { unmount } = render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('4,1 × 10 mm')).toBeInTheDocument();
    unmount();
    mockedLocations.mockResolvedValue([clinicLocation({ locale: 'en-US', hourCycle: 'h12' })]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('4.1 × 10 mm')).toBeInTheDocument();
  });

  it('«Configurar sede» abre la sede sin formato o sin reloj, no la lista', async () => {
    useAuthStore.setState({ accessToken: tokenFor('ADMIN') });
    try {
      mockedList.mockResolvedValue([makeImplant()]);
      mockedLocations.mockResolvedValue([clinicLocation({ id: 'sede-sin-reloj', locale: 'en-US', hourCycle: null })]);
      render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
      expect(await screen.findByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
        'href',
        '/settings/sedes?sede=sede-sin-reloj',
      );
    } finally {
      useAuthStore.setState({ accessToken: null });
    }
  });

  it('sin formato de la sede: la medida «—» y el aviso con Reintentar', async () => {
    mockedList.mockResolvedValue([makeImplant()]);
    mockedLocations.mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Implantes del diente 36' });
    expect(list).not.toHaveTextContent('× 10 mm');
    expect(within(list).getByText('—')).toBeInTheDocument();
  });

  it('carga con esqueleto anunciado', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: /cargando implantes/i })).toBeInTheDocument();
  });

  it('vacío: «Sin implantes registrados» y «Registrar implante» para el odontólogo', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('Sin implantes registrados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar implante/i })).toBeInTheDocument();
  });

  it('error de carga con «Reintentar»', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([makeImplant()]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los implantes.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Implantes del diente 36' })).toBeInTheDocument();
  });

  it('lista por diente con fecha, REF y lote; el anulado tachado con motivo; tarjeta por intervención', async () => {
    mockedList.mockResolvedValue([
      makeImplant({ id: 'i2', kind: 'ABUTMENT', reference: 'RC-ABUT-4', lot: 'LOT-PILAR-7', voidedAt: '2026-10-11T10:00:00.000Z', voidedByName: 'Dra. Laura Ruiz', voidReason: 'Lote mal transcrito' }),
      makeImplant(),
      makeImplant({ id: 'i3', toothNumber: '46', lot: 'LOT-X' }),
    ]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    const tooth36 = await screen.findByRole('list', { name: 'Implantes del diente 36' });
    const [voided, active] = within(tooth36).getAllByRole('listitem');
    expect(active).toHaveTextContent('Implante · Straumann BLT');
    expect(active).toHaveTextContent('REF021.5310');
    expect(active).toHaveTextContent('LoteLOT-AB12');
    expect(active).toHaveTextContent('10/10/2026 · Dra. Laura Ruiz');
    expect(voided).toHaveAttribute('data-status', 'VOIDED');
    expect(voided).toHaveTextContent('Motivo: Lote mal transcrito');
    expect(within(active).getByRole('link', { name: /tarjeta de implante/i })).toHaveAttribute(
      'href',
      '/print/patients/p1/implant-card?date=2026-10-10',
    );
    expect(screen.getByRole('list', { name: 'Implantes del diente 46' })).toBeInTheDocument();
  });

  it('RECEPTION ve e imprime la tarjeta pero no registra ni anula', async () => {
    mockedList.mockResolvedValue([makeImplant()]);
    render(<PatientImplantsTab token={RECEPTION} patientId="p1" />);
    await screen.findByRole('list', { name: 'Implantes del diente 36' });
    expect(screen.getByRole('link', { name: /tarjeta de implante/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar implante/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^anular/i })).not.toBeInTheDocument();
  });

  it('acceso directo del odontograma: abre el formulario con el diente puesto y registra', async () => {
    const user = setupUser();
    const consumed = jest.fn();
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue(makeImplant({ id: 'nuevo' }));
    render(
      <PatientImplantsTab
        token={DENTIST}
        patientId="p1"
        registerTooth="36"
        onShortcutConsumed={consumed}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Registrar implante' });
    expect(within(dialog).getByLabelText('Diente (FDI)')).toHaveValue('36');
    await user.type(within(dialog).getByLabelText('Fabricante'), 'Straumann');
    await user.type(within(dialog).getByLabelText('Referencia (REF)'), '021.5310');
    await user.type(within(dialog).getByLabelText('Lote'), 'LOT-AB12');
    await user.type(within(dialog).getByLabelText('Diámetro (mm)'), '4,1');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar implante' }));
    expect(mockedRegister).toHaveBeenCalledWith(
      DENTIST,
      'p1',
      expect.objectContaining({
        toothNumber: '36',
        kind: 'IMPLANT',
        manufacturer: 'Straumann',
        reference: '021.5310',
        lot: 'LOT-AB12',
        diameterMm: 4.1,
      }),
    );
    expect(await screen.findByRole('list', { name: 'Implantes del diente 36' })).toBeInTheDocument();
    expect(consumed).toHaveBeenCalled();
  });

  it('acceso directo del ítem del plan: registra contra ese ítem con su diente', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue(makeImplant({ id: 'nuevo', treatmentPlanItemId: 'item-9' }));
    render(
      <PatientImplantsTab
        token={DENTIST}
        patientId="p1"
        registerTooth="36"
        registerPlanItemId="item-9"
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Registrar implante' });
    expect(within(dialog).getByLabelText('Diente (FDI)')).toHaveValue('36');
    expect(within(dialog).getByText(/ítem del plan desde el que lo abriste/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Fabricante'), 'Straumann');
    await user.type(within(dialog).getByLabelText('Referencia (REF)'), '021.5310');
    await user.type(within(dialog).getByLabelText('Lote'), 'LOT-AB12');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar implante' }));
    expect(mockedRegister).toHaveBeenCalledWith(
      DENTIST,
      'p1',
      expect.objectContaining({ toothNumber: '36', treatmentPlanItemId: 'item-9' }),
    );
  });

  it('una medida que no es un número no se descarta en silencio: avisa y no envía', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    render(<PatientImplantsTab token={DENTIST} patientId="p1" registerTooth="36" />);
    const dialog = await screen.findByRole('dialog', { name: 'Registrar implante' });
    await user.type(within(dialog).getByLabelText('Fabricante'), 'Straumann');
    await user.type(within(dialog).getByLabelText('Referencia (REF)'), '021.5310');
    await user.type(within(dialog).getByLabelText('Lote'), 'LOT-AB12');
    await user.type(within(dialog).getByLabelText('Diámetro (mm)'), '4.1 mm');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar implante' }));
    expect(await within(dialog).findByText(/diámetro y la longitud se escriben en mm/i)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('el 400 de la API (en español) se enseña en el formulario', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedRegister.mockRejectedValue(
      new ApiError(400, 'No se puede registrar el implante: el diente «19» no es un código FDI válido.'),
    );
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: /registrar implante/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar implante' });
    await user.type(within(dialog).getByLabelText('Diente (FDI)'), '19');
    await user.type(within(dialog).getByLabelText('Fabricante'), 'Straumann');
    await user.type(within(dialog).getByLabelText('Referencia (REF)'), 'R');
    await user.type(within(dialog).getByLabelText('Lote'), 'L');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar implante' }));
    expect(await within(dialog).findByText(/no es un código FDI válido/)).toBeInTheDocument();
  });

  it('anular exige motivo y deja el implante tachado', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeImplant()]);
    mockedVoid.mockResolvedValue(
      makeImplant({ voidedAt: '2026-10-17T10:00:00.000Z', voidedByName: 'Dra. Laura Ruiz', voidReason: 'Diente equivocado' }),
    );
    render(<PatientImplantsTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: /^anular/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular implante' });
    const submit = within(dialog).getByRole('button', { name: 'Anular implante' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Diente equivocado');
    await user.click(submit);
    expect(mockedVoid).toHaveBeenCalledWith(DENTIST, 'impl-1', 'Diente equivocado');
    expect(await screen.findByText(/Motivo: Diente equivocado/)).toBeInTheDocument();
  });
});
