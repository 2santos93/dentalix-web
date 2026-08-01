import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToothRecordPanel } from './tooth-record-panel';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { addToothRecord } from '@/lib/odontogram/odontogram-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching medical-history-panel.test.tsx's convention.
jest.mock('../../lib/odontogram/catalog-api', () => ({
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/odontogram/odontogram-api', () => ({
  addToothRecord: jest.fn(),
}));

const mockedListCatalog = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedAddRecord = addToothRecord as jest.MockedFunction<typeof addToothRecord>;

const catalog = [
  {
    id: 'cat-1',
    tenantId: 't1',
    code: 'CAR',
    category: null,
    kind: 'DIAGNOSIS' as const,
    labelEs: 'Caries',
    labelEn: null,
    labelPt: null,
    color: '#FF0000',
    defaultPrice: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    tenantId: 't1',
    code: 'RES',
    category: null,
    kind: 'PROCEDURE' as const,
    labelEs: 'Resina',
    labelEn: null,
    labelPt: null,
    color: '#00FF00',
    defaultPrice: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createdRecord = {
  id: 'rec-1',
  toothNumber: '11',
  surfaces: ['OCCLUSAL' as const],
  kind: 'DIAGNOSIS' as const,
  catalogItemId: 'cat-1',
  status: 'COMPLETED' as const,
  notes: 'Nota',
  recordedAt: '2026-03-01T00:00:00.000Z',
};

describe('ToothRecordPanel', () => {
  beforeEach(() => {
    mockedListCatalog.mockReset();
    mockedAddRecord.mockReset();
  });

  it('shows a loading state while fetching the catalog', () => {
    mockedListCatalog.mockReturnValue(new Promise(() => {}));
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when the catalog has no items', async () => {
    mockedListCatalog.mockResolvedValue([]);
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    expect(await screen.findByText(/no hay.*cat[aá]logo/i)).toBeInTheDocument();
  });

  it('shows an alert with the API error message when loading the catalog fails, with a retry', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedListCatalog.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedListCatalog.mockResolvedValueOnce(catalog);

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');

    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('radio', { name: /caries/i })).toBeInTheDocument();
  });

  it('renders each catalog item as an accessible option with its color swatch', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);

    const cariesOption = await screen.findByRole('radio', { name: /caries/i });
    const resinaOption = screen.getByRole('radio', { name: /resina/i });
    expect(cariesOption).toBeInTheDocument();
    expect(resinaOption).toBeInTheDocument();

    const swatch = document.querySelector('[style*="rgb(255, 0, 0)"]');
    expect(swatch).toBeTruthy();
  });

  it('renders the 5 surface checkboxes plus a whole-tooth checkbox, all with accessible labels', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    expect(screen.getByRole('checkbox', { name: /vestibular/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /lingual/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /mesial/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /distal/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /oclusal/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /diente completo/i })).toBeInTheDocument();
  });

  it('pre-checks the surface passed via initialSurface', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    render(
      <ToothRecordPanel
        token="tok"
        patientId="p1"
        toothNumber="11"
        initialSurface="OCCLUSAL"
        onRecordAdded={jest.fn()}
      />,
    );
    await screen.findByRole('radio', { name: /caries/i });
    expect(screen.getByRole('checkbox', { name: /oclusal/i })).toBeChecked();
  });

  it('checking "diente completo" clears/disables the individual surface checkboxes', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    const occlusal = screen.getByRole('checkbox', { name: /oclusal/i });
    await user.click(occlusal);
    expect(occlusal).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: /diente completo/i }));
    expect(occlusal).not.toBeChecked();
    expect(occlusal).toBeDisabled();
  });

  it('shows a validation message when submitting without selecting a catalog item', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/selecciona.*cat[aá]logo/i);
    expect(mockedAddRecord).not.toHaveBeenCalled();
  });

  it('shows a validation message when submitting without any surface or whole-tooth selected', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/selecciona.*cara|diente completo/i);
    expect(mockedAddRecord).not.toHaveBeenCalled();
  });

  it('submits with the kind derived from the chosen catalog item, calls addToothRecord and onRecordAdded', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedAddRecord.mockResolvedValue(createdRecord);
    const onRecordAdded = jest.fn();

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={onRecordAdded} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.type(screen.getByLabelText(/notas/i), 'Nota');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedAddRecord).toHaveBeenCalledTimes(1));
    expect(mockedAddRecord).toHaveBeenCalledWith('tok', 'p1', {
      toothNumber: '11',
      catalogItemId: 'cat-1',
      kind: 'DIAGNOSIS',
      surfaces: ['OCCLUSAL'],
      status: expect.stringMatching(/PLANNED|COMPLETED/),
      notes: 'Nota',
    });
    expect(onRecordAdded).toHaveBeenCalledWith(createdRecord);
  });

  it('submits with an empty surfaces array when "diente completo" is checked', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedAddRecord.mockResolvedValue(createdRecord);

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /resina/i });

    await user.click(screen.getByRole('radio', { name: /resina/i }));
    await user.click(screen.getByRole('checkbox', { name: /diente completo/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedAddRecord).toHaveBeenCalledTimes(1));
    expect(mockedAddRecord).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ catalogItemId: 'cat-2', kind: 'PROCEDURE', surfaces: [] }),
    );
  });

  it('lets the user pick the PLANNED/COMPLETED status', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedAddRecord.mockResolvedValue(createdRecord);

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.selectOptions(screen.getByLabelText(/estado/i), 'PLANNED');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedAddRecord).toHaveBeenCalledTimes(1));
    expect(mockedAddRecord).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ status: 'PLANNED' }),
    );
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedAddRecord.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });

  it('resets the catalog selection and surfaces after a successful submit', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedAddRecord.mockResolvedValue(createdRecord);

    const user = userEvent.setup();
    render(<ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />);
    await screen.findByRole('radio', { name: /caries/i });

    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedAddRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('radio', { name: /caries/i })).not.toBeChecked());
    expect(screen.getByRole('checkbox', { name: /oclusal/i })).not.toBeChecked();
  });

  it('does not refetch the catalog when only toothNumber changes (catalog is tenant-wide, not per-tooth)', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    const { rerender } = render(
      <ToothRecordPanel token="tok" patientId="p1" toothNumber="11" onRecordAdded={jest.fn()} />,
    );
    await screen.findByRole('radio', { name: /caries/i });
    expect(mockedListCatalog).toHaveBeenCalledTimes(1);

    rerender(<ToothRecordPanel token="tok" patientId="p1" toothNumber="21" onRecordAdded={jest.fn()} />);
    expect(mockedListCatalog).toHaveBeenCalledTimes(1);
  });
});
