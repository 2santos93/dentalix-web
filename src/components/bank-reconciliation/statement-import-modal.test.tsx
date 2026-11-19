import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatementImportModal, statementImportCopy as copy } from './statement-import-modal';
import {
  confirmStatement,
  inspectStatement,
  previewStatement,
  type BankAccount,
  type BankStatementInspect,
  type BankStatementPreview,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { ApiError } from '@/lib/api/client';
import type { SedeStamp } from '@/lib/locations/sede-stamp';

jest.mock('../../lib/bank-reconciliation/bank-reconciliation-api', () => ({
  ...jest.requireActual('../../lib/bank-reconciliation/bank-reconciliation-api'),
  inspectStatement: jest.fn(),
  previewStatement: jest.fn(),
  confirmStatement: jest.fn(),
}));

const account = { id: 'acc-1', name: 'Cuenta en bolívares', currency: 'VES' } as BankAccount;
const stamp = {
  money: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
  civilDate: (day: string) => day.split('-').reverse().join('/'),
} as unknown as SedeStamp;

const inspect: BankStatementInspect = {
  fileSha256: 'f'.repeat(64),
  fileFormat: 'CSV',
  headers: ['Fecha', 'Referencia', 'Monto', 'Concepto'],
  suggestedMapping: {
    date: 'Fecha',
    reference: 'Referencia',
    amount: 'Monto',
    dateOrder: 'DMY',
    decimalSeparator: ',',
  },
  usesSavedMapping: true,
  sampleRows: [['15/10/2026', '004512', '4.500,00', 'Pago móvil recibido']],
  totalRows: 3,
};

const preview: BankStatementPreview = {
  fileSha256: 'f'.repeat(64),
  fileFormat: 'CSV',
  totalRows: 3,
  creditRows: 2,
  newRows: 2,
  duplicateRows: 0,
  ignoredRows: 1,
  errorRows: 1,
  periodFrom: '2026-10-15',
  periodTo: '2026-10-16',
  issues: [{ rowNumber: 4, code: 'DATE_INVALID', message: 'La fecha «32/10/2026» no es válida.' }],
  rows: [
    {
      rowNumber: 2,
      bookedOn: '2026-10-15',
      reference: '004512',
      amount: 4500,
      description: 'Pago móvil',
      duplicate: false,
    },
  ],
};

function file() {
  return new File(['Fecha;Referencia;Monto\n15/10/2026;004512;4.500,00\n'], 'extracto.csv', { type: 'text/csv' });
}

function renderModal(onImported = jest.fn()) {
  render(
    <StatementImportModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      account={account}
      stamp={stamp}
      onImported={onImported}
    />,
  );
  return onImported;
}

beforeEach(() => {
  jest.clearAllMocks();
  (inspectStatement as jest.Mock).mockResolvedValue(inspect);
  (previewStatement as jest.Mock).mockResolvedValue(preview);
  (confirmStatement as jest.Mock).mockResolvedValue({
    id: 'imp-2',
    fileSha256: 'f'.repeat(64),
    rows: 3,
    valid: 2,
    created: 2,
    duplicates: 0,
    ignored: 1,
    errors: 1,
    matched: 1,
    periodFrom: '2026-10-15',
    periodTo: '2026-10-16',
  });
});

describe('StatementImportModal (DX-571)', () => {
  it('archivo → columnas (mapeo guardado) → vista previa → importar', async () => {
    const user = userEvent.setup();
    const onImported = renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    const chosen = file();
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), chosen);
    await waitFor(() => expect(inspectStatement).toHaveBeenCalledWith('tok', 'acc-1', chosen, expect.any(Function)));

    expect(await within(dialog).findByText(copy.savedMapping)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Fecha/)).toHaveValue('Fecha');
    expect(within(dialog).getByLabelText(/^Importe con signo/)).toHaveValue('Monto');
    // El ejemplo de la primera fila junto a cada columna.
    expect(within(dialog).getByText('004512')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/^Descripción/), 'Concepto');
    await user.click(within(dialog).getByRole('button', { name: copy.toPreview }));
    await waitFor(() =>
      expect(previewStatement).toHaveBeenCalledWith(
        'tok',
        'acc-1',
        chosen,
        expect.objectContaining({ description: 'Concepto', amount: 'Monto' }),
        expect.any(Function),
      ),
    );

    expect(await within(dialog).findByRole('table', { name: copy.issuesLabel })).toHaveTextContent(
      'La fecha «32/10/2026» no es válida.',
    );
    expect(within(dialog).getByRole('table', { name: copy.rowsLabel })).toHaveTextContent('VES 4500.00');
    expect(within(dialog).getByText(copy.ignoredRows).nextSibling).toHaveTextContent('1');
    await user.click(within(dialog).getByRole('button', { name: copy.confirm(2) }));
    await waitFor(() =>
      expect(confirmStatement).toHaveBeenCalledWith(
        'tok',
        'acc-1',
        chosen,
        expect.objectContaining({ description: 'Concepto' }),
        'f'.repeat(64),
        expect.any(Function),
      ),
    );
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ created: 2, matched: 1 }));
  });

  it('sin columnas obligatorias no pide la vista previa', async () => {
    (inspectStatement as jest.Mock).mockResolvedValue({
      ...inspect,
      usesSavedMapping: false,
      suggestedMapping: { dateOrder: 'DMY', decimalSeparator: ',' },
    });
    const user = userEvent.setup();
    renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), file());
    expect(await within(dialog).findByText(copy.suggestedMapping)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: copy.toPreview }));
    expect(await within(dialog).findByText(copy.mappingIncomplete)).toBeInTheDocument();
    expect(previewStatement).not.toHaveBeenCalled();
  });

  it('dos columnas: créditos y débitos en lugar del importe con signo', async () => {
    const user = userEvent.setup();
    renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), file());
    await user.click(await within(dialog).findByRole('radio', { name: /Dos columnas/ }));
    expect(within(dialog).queryByLabelText(/^Importe con signo/)).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/^Créditos/), 'Monto');
    await user.click(within(dialog).getByRole('button', { name: copy.toPreview }));
    await waitFor(() =>
      expect(previewStatement).toHaveBeenCalledWith(
        'tok',
        'acc-1',
        expect.any(File),
        expect.not.objectContaining({ amount: expect.anything() }),
        expect.any(Function),
      ),
    );
    expect((previewStatement as jest.Mock).mock.calls[0][3]).toEqual(expect.objectContaining({ credit: 'Monto' }));
  });

  it('el archivo cambió desde la vista previa (409): vuelve a pedir el archivo y lo dice', async () => {
    (confirmStatement as jest.Mock).mockRejectedValue(
      new ApiError(409, 'El archivo cambió.', { code: 'BANK_STATEMENT_CHANGED' }),
    );
    const user = userEvent.setup();
    const onImported = renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), file());
    await user.click(await within(dialog).findByRole('button', { name: copy.toPreview }));
    await user.click(await within(dialog).findByRole('button', { name: copy.confirm(2) }));
    expect(await within(dialog).findByText(copy.changed)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: copy.chooseFile })).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('sin entradas nuevas no deja importar', async () => {
    (previewStatement as jest.Mock).mockResolvedValue({ ...preview, newRows: 0, duplicateRows: 2 });
    const user = userEvent.setup();
    renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), file());
    await user.click(await within(dialog).findByRole('button', { name: copy.toPreview }));
    expect(await within(dialog).findByText(copy.nothingNew)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: copy.confirm(0) })).toBeDisabled();
  });

  it('más de 5 MB: lo dice sin subirlo', async () => {
    const user = userEvent.setup();
    renderModal();
    const dialog = screen.getByRole('dialog', { name: copy.title });
    const big = new File(['x'], 'grande.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(within(dialog).getByLabelText(copy.fileLabel), big);
    expect(await within(dialog).findByText(copy.tooBig)).toBeInTheDocument();
    expect(inspectStatement).not.toHaveBeenCalled();
  });
});
