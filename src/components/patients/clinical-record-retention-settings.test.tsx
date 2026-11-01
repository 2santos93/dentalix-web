import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalRecordRetentionSettingsSection } from './clinical-record-retention-settings';
import {
  getRetentionSettings,
  RETENTION_REDUCTION_UNCONFIRMED,
  RETENTION_SETTINGS_BUSY,
  saveRetentionSettings,
  type RetentionSettings,
  type RetentionSettingsUpdateResult,
} from '@/lib/patients/retention-settings-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/retention-settings-api', () => ({
  ...jest.requireActual('../../lib/patients/retention-settings-api'),
  getRetentionSettings: jest.fn(),
  saveRetentionSettings: jest.fn(),
}));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(() => ({
    status: 'ready',
    fmt: jest.requireActual('../../lib/format/regional-format').regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
  })),
}));

const mockedGet = jest.mocked(getRetentionSettings);
const mockedSave = jest.mocked(saveRetentionSettings);

const base: RetentionSettings = {
  clinicalRecordRetentionYears: 15,
  effectiveYears: 15,
  platformMinimumYears: 15,
  maximumYears: 100,
  correctionWindow: null,
};
const result = (over: Partial<RetentionSettingsUpdateResult>): RetentionSettingsUpdateResult => ({
  ...base,
  protectedPatients: 0,
  ...over,
});
const INVALID = (min: number) =>
  `El plazo de conservación de la historia clínica tiene que ser un número entero de años entre ${min} y 100.`;
const UNCONFIRMED_MESSAGE =
  'Vas a reducir el plazo de 20 a 16 años. 3 historias que hoy se conservan con 20 años mantienen su fecha de fin; el plazo de 16 años se aplica al resto y a las atenciones nuevas. Confirma la reducción para guardarla.';
const unconfirmed = (message = UNCONFIRMED_MESSAGE) =>
  new ApiError(409, message, { code: RETENTION_REDUCTION_UNCONFIRMED });

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Cambiar el plazo de conservación' }));
  await screen.findByRole('dialog', { name: 'Cambiar el plazo de conservación' });
}
async function setYears(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Años');
  await user.clear(field);
  if (value) await user.type(field, value);
}

describe('ClinicalRecordRetentionSettingsSection (DX-330)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('shows 15 años as the default value', async () => {
    mockedGet.mockResolvedValue(base);
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    expect(await screen.findByTestId('retention-years')).toHaveTextContent('15 años');
    expect(screen.getByText('Por defecto')).toBeInTheDocument();
    expect(screen.getByText(/El mínimo de la plataforma es de 15 años\./)).toBeInTheDocument();
  });

  it('a raise saves without a second step, warns about the 24 hours and says «Subir a n años»', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    mockedSave.mockResolvedValueOnce(result({ clinicalRecordRetentionYears: 20, effectiveYears: 20 }));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '20');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('durante 24 horas puedes volver a 15 años sin ningún efecto');
    expect(dialog).toHaveTextContent('eso no se puede deshacer');
    await user.click(screen.getByRole('button', { name: 'Subir a 20 años' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { clinicalRecordRetentionYears: 20 }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByTestId('retention-years')).toHaveTextContent('20 años');
    expect(screen.getByRole('status')).toHaveTextContent('Plazo guardado: 20 años.');
  });

  it('a reduction shows the second step with the 409 message and resends with confirmReduction', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    mockedSave
      .mockRejectedValueOnce(unconfirmed())
      .mockResolvedValueOnce(result({ clinicalRecordRetentionYears: 16, effectiveYears: 16, protectedPatients: 3 }));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    expect(screen.getByRole('dialog')).toHaveTextContent('Las historias que hoy están en retención mantienen su fecha de fin');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('dialog', { name: 'Reducir el plazo de 20 a 16 años' })).toBeInTheDocument();
    expect(screen.getByText(UNCONFIRMED_MESSAGE)).toBeInTheDocument();
    expect(mockedSave).toHaveBeenLastCalledWith('tok', { clinicalRecordRetentionYears: 16 });
    await user.click(screen.getByRole('button', { name: 'Reducir el plazo' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenLastCalledWith('tok', { clinicalRecordRetentionYears: 16, confirmReduction: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Plazo guardado: 16 años. 3 historias mantienen su fecha anterior.');
  });

  it.each([
    [0, 'Plazo guardado: 16 años.'],
    [1, 'Plazo guardado: 16 años. 1 historia mantiene su fecha anterior.'],
    [2, 'Plazo guardado: 16 años. 2 historias mantienen su fecha anterior.'],
  ])('the reduction notice with %i protected patients', async (n, text) => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    mockedSave
      .mockRejectedValueOnce(unconfirmed())
      .mockResolvedValueOnce(result({ clinicalRecordRetentionYears: 16, effectiveYears: 16, protectedPatients: n }));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(await screen.findByRole('button', { name: 'Reducir el plazo' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text));
    expect(screen.getByRole('status').textContent).toBe(text);
  });

  it('the 400 shows in an InlineError inside the dialog', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    mockedSave.mockRejectedValueOnce(new ApiError(400, INVALID(15)));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '20');
    await user.click(screen.getByRole('button', { name: 'Subir a 20 años' }));
    expect(await screen.findByText(INVALID(15))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a load failure shows the section error with retry', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error')).mockResolvedValueOnce(base);
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    expect(await screen.findByText('No pudimos cargar el plazo de conservación.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByTestId('retention-years')).toHaveTextContent('15 años');
  });

  it('non-admin sees the locked state', () => {
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia el plazo de conservación.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('shows the note when the platform minimum is above the saved term', async () => {
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 15, effectiveYears: 20, platformMinimumYears: 20 });
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    expect(await screen.findByText('La plataforma exige al menos 20 años: se aplica 20.')).toBeInTheDocument();
  });

  it('the dialog starts at the effective term', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 15, effectiveYears: 20, platformMinimumYears: 20 });
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    expect(screen.getByLabelText('Años')).toHaveValue(20);
    expect(screen.getByText('La plataforma exige al menos 20 años: se aplica 20.')).toBeInTheDocument();
  });

  it.each([
    ['9 over the term', '24', false],
    ['10 over the term', '25', true],
  ])('big jump warning: %s', async (_name, value, shown) => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, value);
    const warning = screen.queryByText('Es un salto grande: revisa el número.');
    if (shown) expect(warning).toBeInTheDocument();
    else expect(warning).not.toBeInTheDocument();
  });

  it('shows the correction window note and the chained-raise sentence with the until date', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({
      ...base,
      clinicalRecordRetentionYears: 20,
      effectiveYears: 20,
      correctionWindow: { previousYears: 15, until: '2026-11-02T15:00:00.000Z' },
    });
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    const note = await screen.findByText(/Hasta el .* puedes volver a 15 años sin ningún efecto\./);
    expect(note).toBeInTheDocument();
    await openDialog(user);
    await setYears(user, '25');
    expect(screen.getByRole('dialog')).toHaveTextContent(/Puedes volver a 15 años sin ningún efecto hasta el /);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('durante 24 horas puedes volver');
    await setYears(user, '16');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Estás corrigiendo una subida reciente: esa subida no deja fechas fijadas.',
    );
    // Volver a 16 (por encima del plazo anterior) no fija nada: no dice que se mantenga ninguna fecha.
    expect(screen.getByRole('dialog')).not.toHaveTextContent('mantienen su fecha');
  });

  it('a reduction below the previous term inside the window says the previous term is kept', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({
      ...base,
      clinicalRecordRetentionYears: 20,
      effectiveYears: 20,
      correctionWindow: { previousYears: 18, until: '2026-11-02T15:00:00.000Z' },
    });
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    expect(screen.getByRole('dialog')).toHaveTextContent('mantienen su fecha de 18 años');
  });

  it('invalid drafts never reach the API', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20, platformMinimumYears: 20 });
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    for (const draft of ['', '15,5', '1e2', '-20', '19']) {
      // `fireEvent`: el navegador entrega «1e2» tal cual, y user-event lo normaliza.
      fireEvent.change(screen.getByLabelText('Años'), { target: { value: draft } });
      await user.click(screen.getByRole('button', { name: /^(Guardar|Subir a \d+ años)$/ }));
      expect(await screen.findByText(INVALID(20))).toBeInTheDocument();
    }
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('the confirm button sends once', async () => {
    const user = userEvent.setup({ delay: null });
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    let resolve: (r: RetentionSettingsUpdateResult) => void = () => undefined;
    mockedSave.mockRejectedValueOnce(unconfirmed()).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    const confirm = await screen.findByRole('button', { name: 'Reducir el plazo' });
    await user.dblClick(confirm);
    expect(mockedSave.mock.calls.filter(([, input]) => input.confirmReduction === true)).toHaveLength(1);
    resolve(result({ clinicalRecordRetentionYears: 16, effectiveYears: 16 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the second step trusts the API over the local correction window', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({
      ...base,
      clinicalRecordRetentionYears: 20,
      effectiveYears: 20,
      correctionWindow: { previousYears: 15, until: '2026-11-02T15:00:00.000Z' },
    });
    const apiText = 'Vas a reducir el plazo de 20 a 18 años. Ninguna historia en retención mantiene una fecha anterior. Confirma la reducción para guardarla.';
    mockedSave.mockRejectedValueOnce(unconfirmed(apiText));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '18');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(apiText)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Estás corrigiendo una subida reciente');
  });

  it('keeps a long 409 message', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    const long = `Vas a reducir el plazo de 20 a 16 años. ${'Las historias de la clínica mantienen su fecha de fin. '.repeat(5)}Confirma la reducción para guardarla.`;
    expect(long.length).toBeGreaterThan(280);
    mockedSave.mockRejectedValueOnce(unconfirmed(long));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(long)).toBeInTheDocument();
  });

  it('a busy answer stays in the dialog', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    const busy = 'Hay otra operación con los pacientes de la clínica en curso. Intenta de nuevo en unos segundos.';
    mockedSave.mockRejectedValueOnce(new ApiError(409, busy, { code: RETENTION_SETTINGS_BUSY }));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '20');
    await user.click(screen.getByRole('button', { name: 'Subir a 20 años' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(busy);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('the raise warning and the big-jump warning are tied to the field and the button', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '30');
    const describedText = (el: HTMLElement) =>
      (el.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' | ');
    for (const el of [screen.getByLabelText('Años'), screen.getByRole('button', { name: 'Subir a 30 años' })]) {
      expect(describedText(el)).toContain('eso no se puede deshacer');
      expect(describedText(el)).toContain('Es un salto grande');
    }
  });

  it('dismissing during a save is blocked and the failure stays visible', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(base);
    let reject: (e: unknown) => void = () => undefined;
    mockedSave.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '20');
    await user.click(screen.getByRole('button', { name: 'Subir a 20 años' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const busy = 'Hay otra operación con los pacientes de la clínica en curso. Intenta de nuevo en unos segundos.';
    reject(new ApiError(409, busy, { code: RETENTION_SETTINGS_BUSY }));
    expect(await screen.findByRole('alert')).toHaveTextContent(busy);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('an unconfirmed answer after an Escape press does not reopen anything by itself', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    let reject: (e: unknown) => void = () => undefined;
    mockedSave.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.keyboard('{Escape}');
    // El diálogo sigue abierto (no se pudo descartar), así que el paso 2 aparece donde el usuario mira.
    reject(unconfirmed());
    expect(await screen.findByRole('dialog', { name: 'Reducir el plazo de 20 a 16 años' })).toBeInTheDocument();
  });

  it('two submits in the same tick send once', async () => {
    mockedGet.mockResolvedValue(base);
    mockedSave.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '20');
    const form = screen.getByLabelText('Años').closest('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it('a busy answer in the confirm step stays there, and Volver keeps the draft and clears the error', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    const busy = 'Hay otra operación con los pacientes de la clínica en curso. Intenta de nuevo en unos segundos.';
    mockedSave
      .mockRejectedValueOnce(unconfirmed())
      .mockRejectedValueOnce(new ApiError(409, busy, { code: RETENTION_SETTINGS_BUSY }));
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(await screen.findByRole('button', { name: 'Reducir el plazo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(busy);
    expect(screen.getByRole('dialog', { name: 'Reducir el plazo de 20 a 16 años' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByLabelText('Años')).toHaveValue(16);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Años')).toHaveFocus();
  });

  it('moves focus to Volver in the confirm step', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...base, clinicalRecordRetentionYears: 20, effectiveYears: 20 });
    mockedSave.mockRejectedValueOnce(unconfirmed());
    render(<ClinicalRecordRetentionSettingsSection token="tok" allowed />);
    await openDialog(user);
    await setYears(user, '16');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    const back = await screen.findByRole('button', { name: 'Volver' });
    await waitFor(() => expect(back).toHaveFocus());
  });
});
