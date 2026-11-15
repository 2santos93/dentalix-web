import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { getMergePreview, mergePatients } from '@/lib/patients/patient-merge-api';
import { STAMP_FORMATS, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { duplicatePair, mergeFields, mergePreview, mergeSide } from '@/lib/test/patient-merge';
import { MergePatientsDialog, mergeDialogCopy as copy, defaultKeptId } from './merge-patients-dialog';

jest.mock('../../lib/patients/patient-merge-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-merge-api'),
  getMergePreview: jest.fn(),
  mergePatients: jest.fn(),
}));
const mockedPreview = getMergePreview as jest.MockedFunction<typeof getMergePreview>;
const mockedMerge = mergePatients as jest.MockedFunction<typeof mergePatients>;

const stamp = testStamp([STAMP_SEDES.caracas]);

function renderDialog(over: Partial<React.ComponentProps<typeof MergePatientsDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    token: 'tok',
    pair: duplicatePair(),
    stamp,
    docTypeNames: {},
    onMerged: jest.fn(),
    onStale: jest.fn(),
    ...over,
  };
  render(<MergePatientsDialog {...props} />);
  return props;
}

const submitButton = () => screen.getByRole('button', { name: copy.submit });

describe('MergePatientsDialog (DX-266)', () => {
  beforeEach(() => {
    mockedPreview.mockReset();
    mockedMerge.mockReset();
  });

  it('propone conservar la ficha más antigua y pide su comparación', async () => {
    mockedPreview.mockResolvedValue(mergePreview());
    renderDialog();
    expect(defaultKeptId(duplicatePair())).toBe('p-a');
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith('tok', 'p-a', 'p-b'));
    const kept = screen.getByRole('radiogroup', { name: copy.keptLegend });
    expect(within(kept).getAllByRole('radio')[0]).toBeChecked();
  });

  it('enseña solo los grupos distintos, con el del conservado elegido por defecto', async () => {
    mockedPreview.mockResolvedValue(
      mergePreview({
        absorbed: mergeSide({
          id: 'p-b',
          fields: mergeFields({ docNumber: '12345678', phone: null, email: 'maria.r@correo.com.ve' }),
        }),
      }),
    );
    renderDialog();
    const doc = await screen.findByRole('radiogroup', { name: 'Documento' });
    expect(within(doc).getByRole('radio', { name: 'Documento nacional V-12.345.678' })).toBeChecked();
    expect(within(doc).getByRole('radio', { name: 'Documento nacional 12345678' })).not.toBeChecked();
    // El teléfono solo está en la conservada: se queda el suyo.
    const phone = screen.getByRole('radiogroup', { name: 'Teléfono' });
    expect(within(phone).getByRole('radio', { name: '+584141234567' })).toBeChecked();
    expect(within(phone).getByRole('radio', { name: copy.empty })).not.toBeChecked();
    // El correo solo está en la absorbida: se propone el suyo, no el vacío.
    const email = screen.getByRole('radiogroup', { name: 'Correo' });
    expect(within(email).getByRole('radio', { name: 'maria.r@correo.com.ve' })).toBeChecked();
    expect(within(email).getByRole('radio', { name: copy.empty })).not.toBeChecked();
    // Los iguales no se eligen: se listan.
    expect(screen.queryByRole('radiogroup', { name: 'Nombre' })).not.toBeInTheDocument();
    expect(screen.getByText(/Nombre, Apellidos, Fecha de nacimiento, Sexo/)).toBeInTheDocument();
  });

  it('pinta la fecha de nacimiento con el formato de la sede', async () => {
    mockedPreview.mockResolvedValue(
      mergePreview({ absorbed: mergeSide({ id: 'p-b', fields: mergeFields({ birthDate: '1990-12-04' }) }) }),
    );
    renderDialog();
    const birth = await screen.findByRole('radiogroup', { name: 'Fecha de nacimiento' });
    expect(within(birth).getByRole('radio', { name: STAMP_FORMATS.caracas.civilDate('1990-04-12') })).toBeChecked();
  });

  it('fusiona con el cuerpo de lo elegido tras confirmar que no se deshace', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(
      mergePreview({
        absorbed: mergeSide({
          id: 'p-b',
          fields: mergeFields({ docNumber: '12345678', firstName: 'María José', email: 'mj@correo.com.ve' }),
          counts: [
            { category: 'appointments', count: 2 },
            { category: 'payments', count: 1 },
          ],
        }),
      }),
    );
    mockedMerge.mockResolvedValue({
      patientId: 'p-a',
      absorbedPatientId: 'p-b',
      moved: [],
      resolved: [],
      revokedLinks: mergePreview().absorbedLiveLinks,
      fieldsFromAbsorbed: ['firstName', 'email'],
    });
    const props = renderDialog();
    await user.click(
      within(await screen.findByRole('radiogroup', { name: 'Nombre' })).getByRole('radio', { name: 'María José' }),
    );
    await user.click(within(screen.getByRole('radiogroup', { name: 'Correo' })).getByRole('radio', { name: 'mj@correo.com.ve' }));
    expect(screen.getByRole('list', { name: copy.movesListLabel })).toHaveTextContent('2 citas');
    expect(screen.getByRole('list', { name: copy.movesListLabel })).toHaveTextContent('1 pago');
    expect(screen.getByText(copy.irreversibleTitle)).toBeInTheDocument();

    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(copy.hintConfirm)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());

    await waitFor(() =>
      expect(mockedMerge).toHaveBeenCalledWith('tok', {
        keptId: 'p-a',
        absorbedId: 'p-b',
        fields: { firstName: 'ABSORBED', email: 'ABSORBED' },
      }),
    );
    expect(props.onMerged).toHaveBeenCalledWith(expect.objectContaining({ patientId: 'p-a' }), 'María José Rodríguez');
  });

  it('sin elegir nada del absorbido, el cuerpo no lleva `fields`', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(mergePreview());
    mockedMerge.mockResolvedValue({} as never);
    renderDialog();
    await user.click(await screen.findByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());
    await waitFor(() => expect(mockedMerge).toHaveBeenCalledWith('tok', { keptId: 'p-a', absorbedId: 'p-b' }));
  });

  it('cambiar la ficha que se conserva pide la comparación al revés y olvida las elecciones', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(mergePreview());
    renderDialog();
    await user.click(await screen.findByRole('checkbox', { name: copy.confirm }));
    const kept = screen.getByRole('radiogroup', { name: copy.keptLegend });
    await user.click(within(kept).getAllByRole('radio')[1]);
    await waitFor(() => expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p-b', 'p-a'));
    expect(await screen.findByRole('checkbox', { name: copy.confirm })).not.toBeChecked();
  });

  it('un bloqueo se explica y no deja fusionar', async () => {
    mockedPreview.mockResolvedValue(mergePreview({ blockers: ['DX266_OVERLAPPING_APPOINTMENTS'] }));
    renderDialog();
    expect(await screen.findByText(copy.blockersTitle)).toBeInTheDocument();
    expect(screen.getByText(/Los dos pacientes tienen citas a la misma hora/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: copy.confirm })).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(copy.hintBlocked)).toBeInTheDocument();
  });

  it('avisa de los enlaces enviados que se anularán', async () => {
    const links = { ...mergePreview().absorbedLiveLinks, prescriptionCopies: 1, paymentLinks: 2, total: 3 };
    mockedPreview.mockResolvedValue(mergePreview({ absorbedLiveLinks: links }));
    renderDialog();
    expect(await screen.findByText(copy.linksTitle(3))).toBeInTheDocument();
    expect(screen.getByText('1 copia de una receta')).toBeInTheDocument();
    expect(screen.getByText('2 enlaces de pago')).toBeInTheDocument();
  });

  it('si la comparación no carga, error de sección con reintento y sin botón de fusionar', async () => {
    const user = userEvent.setup();
    mockedPreview.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(mergePreview());
    renderDialog();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.loadError);
    expect(screen.queryByRole('button', { name: copy.submit })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('checkbox', { name: copy.confirm })).toBeInTheDocument();
  });

  it('un bloqueo que aparece al fusionar se dice y relee la comparación', async () => {
    const user = userEvent.setup();
    mockedPreview
      .mockResolvedValueOnce(mergePreview())
      .mockResolvedValue(mergePreview({ blockers: ['DX266_OPEN_PAYMENT_PROMISES'] }));
    mockedMerge.mockRejectedValue(
      new ApiError(409, 'Los dos pacientes tienen un compromiso de pago abierto. Cierra uno de los dos antes de fusionar.', {
        code: 'MERGE_OPEN_PAYMENT_PROMISES',
      }),
    );
    renderDialog();
    await user.click(await screen.findByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());
    expect(await screen.findByText(copy.blockersTitle)).toBeInTheDocument();
    expect(mockedPreview).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/compromiso de pago abierto/).length).toBeGreaterThanOrEqual(2);
  });

  it('si uno ya no está vivo, avisa a la lista para que se relea', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(mergePreview());
    mockedMerge.mockRejectedValue(
      new ApiError(409, 'Uno de los dos pacientes ya está archivado o se fusionó con otro. Recarga la lista.', {
        code: 'MERGE_PATIENT_INACTIVE',
      }),
    );
    const props = renderDialog();
    await user.click(await screen.findByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());
    expect(await screen.findByText(/ya está archivado o se fusionó con otro/)).toBeInTheDocument();
    expect(props.onStale).toHaveBeenCalled();
    expect(props.onMerged).not.toHaveBeenCalled();
  });

  it('sin tocar nada, lo que solo tiene la absorbida viaja en el cuerpo; lo que tienen las dos, no', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(
      mergePreview({
        kept: mergeSide({ fields: mergeFields({ docNumber: null, email: null }) }),
        absorbed: mergeSide({
          id: 'p-b',
          fields: mergeFields({ docNumber: '12345678', email: 'maria.r@correo.com.ve', phone: '+584125550000' }),
        }),
      }),
    );
    mockedMerge.mockResolvedValue({} as never);
    renderDialog();
    const doc = await screen.findByRole('radiogroup', { name: 'Documento' });
    expect(within(doc).getByRole('radio', { name: 'Documento nacional 12345678' })).toBeChecked();
    // Teléfonos distintos en las dos: sigue el del conservado.
    const phone = screen.getByRole('radiogroup', { name: 'Teléfono' });
    expect(within(phone).getByRole('radio', { name: '+584141234567' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());
    await waitFor(() =>
      expect(mockedMerge).toHaveBeenCalledWith('tok', {
        keptId: 'p-a',
        absorbedId: 'p-b',
        fields: { document: 'ABSORBED', email: 'ABSORBED' },
      }),
    );
  });

  it('se puede volver al vacío del conservado aunque se proponga el de la absorbida', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(
      mergePreview({ absorbed: mergeSide({ id: 'p-b', fields: mergeFields({ email: 'maria.r@correo.com.ve' }) }) }),
    );
    mockedMerge.mockResolvedValue({} as never);
    renderDialog();
    const email = await screen.findByRole('radiogroup', { name: 'Correo' });
    await user.click(within(email).getByRole('radio', { name: copy.empty }));
    await user.click(screen.getByRole('checkbox', { name: copy.confirm }));
    await user.click(submitButton());
    await waitFor(() => expect(mockedMerge).toHaveBeenCalledWith('tok', { keptId: 'p-a', absorbedId: 'p-b' }));
  });

  it('la dirección enseña la ciudad por su nombre', async () => {
    mockedPreview.mockResolvedValue(
      mergePreview({
        kept: mergeSide({ cityName: 'Valencia', fields: mergeFields({ address: 'Av. Bolívar 12', cityId: 10 }) }),
        absorbed: mergeSide({
          id: 'p-b',
          cityName: 'Maracay',
          fields: mergeFields({ address: 'Av. Bolívar 12', cityId: 11 }),
        }),
      }),
    );
    renderDialog();
    const address = await screen.findByRole('radiogroup', { name: 'Dirección' });
    expect(within(address).getByRole('radio', { name: 'Av. Bolívar 12 · Valencia · Venezuela' })).toBeChecked();
    expect(within(address).getByRole('radio', { name: 'Av. Bolívar 12 · Maracay · Venezuela' })).not.toBeChecked();
  });
});
