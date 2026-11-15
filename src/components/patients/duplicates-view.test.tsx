import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { listLocations } from '@/lib/locations/locations-api';
import {
  dismissDuplicate,
  getMergePreview,
  listDuplicates,
  mergePatients,
  type DuplicatePage,
} from '@/lib/patients/patient-merge-api';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { duplicatePair, duplicatePatient, mergePreview } from '@/lib/test/patient-merge';
import { DuplicatesView, duplicatesCopy as copy } from './duplicates-view';
import { mergeDialogCopy } from './merge-patients-dialog';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn(), info: jest.fn() } }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/patients/document-type-names-api', () => ({ getDocumentTypeNames: jest.fn().mockResolvedValue({}) }));
jest.mock('../../lib/patients/patient-merge-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-merge-api'),
  listDuplicates: jest.fn(),
  dismissDuplicate: jest.fn(),
  getMergePreview: jest.fn(),
  mergePatients: jest.fn(),
}));
const mockedList = listDuplicates as jest.MockedFunction<typeof listDuplicates>;
const mockedDismiss = dismissDuplicate as jest.MockedFunction<typeof dismissDuplicate>;
const mockedPreview = getMergePreview as jest.MockedFunction<typeof getMergePreview>;
const mockedMerge = mergePatients as jest.MockedFunction<typeof mergePatients>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const page = (items = [duplicatePair()], over: Partial<DuplicatePage> = {}): DuplicatePage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...over,
});

const list = () => screen.findByRole('list', { name: copy.listLabel });

describe('DuplicatesView (DX-266)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedDismiss.mockReset();
    mockedPreview.mockReset();
    mockedMerge.mockReset();
    mockedLocations.mockResolvedValue([STAMP_SEDES.caracas]);
  });

  it('cada pareja dice por qué salió y enseña las dos fichas', async () => {
    mockedList.mockResolvedValue(page());
    render(<DuplicatesView token="tok" />);
    const card = within(await list()).getAllByRole('listitem')[0];
    expect(card).toHaveTextContent('Mismo documento');
    expect(card).toHaveTextContent('Mismo nombre y nacimiento');
    const links = within(card).getAllByRole('link', { name: 'María Rodríguez' });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/patients/p-a', '/patients/p-b']);
    expect(card).toHaveTextContent('Documento nacional V-12.345.678');
    expect(card).toHaveTextContent('Documento nacional 12345678');
    expect(card).toHaveTextContent('Código 1042');
    await waitFor(() => expect(card).toHaveTextContent(`Nació ${STAMP_FORMATS.caracas.civilDate('1990-04-12')}`));
    expect(card).toHaveTextContent('Sin atenciones');
    expect(screen.getByText('1 pareja')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { page: 1, locationId: null });
  });

  it('mientras carga, un esqueleto; vacía, un estado que explica qué se revisa', async () => {
    let resolve!: (p: DuplicatePage) => void;
    mockedList.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DuplicatesView token="tok" />);
    expect(screen.getAllByRole('status', { name: 'Cargando' }).length).toBeGreaterThan(0);
    resolve(page([]));
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.emptyHint)).toBeInTheDocument();
  });

  it('si la lista falla, error de sección y Reintentar la vuelve a pedir', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(page());
    render(<DuplicatesView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.loadError);
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await list()).toBeInTheDocument();
  });

  it('un 403 enseña el aviso de permiso, no un error', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Solo un administrador puede revisar y fusionar pacientes duplicados.'));
    render(<DuplicatesView token="tok" />);
    expect(await screen.findByText(copy.forbiddenTitle)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con varias sedes filtra por la elegida y vuelve a la página 1', async () => {
    const user = userEvent.setup();
    mockedLocations.mockResolvedValue([STAMP_SEDES.caracas, STAMP_SEDES.miami]);
    mockedList.mockResolvedValue(page());
    render(<DuplicatesView token="tok" />);
    const select = await screen.findByRole('combobox', { name: copy.locationLabel });
    await user.selectOptions(select, 'Miami');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { page: 1, locationId: 'sede-miami' }));
  });

  it('con una sola sede no hay filtro', async () => {
    mockedList.mockResolvedValue(page());
    render(<DuplicatesView token="tok" />);
    await list();
    expect(screen.queryByRole('combobox', { name: copy.locationLabel })).not.toBeInTheDocument();
  });

  it('pagina cuando hay más parejas que la página', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([duplicatePair()], { total: 45 }));
    render(<DuplicatesView token="tok" />);
    await list();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { page: 2, locationId: null }));
  });

  it('«No es duplicado» la marca y relee la lista', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(page()).mockResolvedValue(page([]));
    mockedDismiss.mockResolvedValue();
    render(<DuplicatesView token="tok" />);
    await list();
    await user.click(screen.getByRole('button', { name: copy.dismissLabel('María Rodríguez', 'María Rodríguez') }));
    expect(mockedDismiss).toHaveBeenCalledWith('tok', ['p-a', 'p-b']);
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it('si «No es duplicado» falla, aviso con reintento y la lista se queda', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page());
    mockedDismiss.mockRejectedValue(new ApiError(500, 'boom'));
    render(<DuplicatesView token="tok" />);
    await list();
    await user.click(screen.getByRole('button', { name: copy.dismissLabel('María Rodríguez', 'María Rodríguez') }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(copy.dismissError, expect.objectContaining({ action: expect.anything() })),
    );
    expect(await list()).toBeInTheDocument();
  });

  it('«Fusionar…» abre el modal (bajo demanda) y, al fusionar, la pareja se va y se ofrece la ficha', async () => {
    const user = userEvent.setup();
    const other = duplicatePair({
      patients: [duplicatePatient({ id: 'p-c', firstName: 'José' }), duplicatePatient({ id: 'p-d', firstName: 'José' })],
      reasons: ['PHONE_NAME'],
    });
    mockedList.mockResolvedValueOnce(page([duplicatePair(), other])).mockResolvedValue(page([other]));
    mockedPreview.mockResolvedValue(mergePreview());
    mockedMerge.mockResolvedValue({
      patientId: 'p-a',
      absorbedPatientId: 'p-b',
      moved: [],
      resolved: [],
      revokedLinks: mergePreview().absorbedLiveLinks,
      fieldsFromAbsorbed: [],
    });
    render(<DuplicatesView token="tok" />);
    await list();
    await user.click(screen.getByRole('button', { name: copy.mergeLabel('María Rodríguez', 'María Rodríguez') }));
    const dialog = await screen.findByRole('dialog', { name: mergeDialogCopy.title });
    await user.click(await within(dialog).findByRole('checkbox', { name: mergeDialogCopy.confirm }));
    await user.click(within(dialog).getByRole('button', { name: mergeDialogCopy.submit }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const notice = await screen.findByText(copy.mergedTitle('María Rodríguez'));
    expect(screen.getByRole('link', { name: copy.openKept })).toHaveAttribute('href', '/patients/p-a');
    expect(notice).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('list', { name: copy.listLabel }).querySelectorAll(':scope > li')).toHaveLength(1),
    );
    expect(screen.getByRole('list', { name: copy.listLabel })).not.toHaveTextContent('Mismo documento');
  });
});
