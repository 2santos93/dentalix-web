import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentTypeNamesSettingsSection } from './document-type-names-settings';
import { DOC_TYPES, DOC_TYPE_LABEL } from '@/lib/patients/doc-type';
import {
  getDocumentTypeNames,
  updateDocumentTypeNames,
} from '@/lib/patients/document-type-names-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/document-type-names-api', () => ({
  ...jest.requireActual('../../lib/patients/document-type-names-api'),
  getDocumentTypeNames: jest.fn(),
  updateDocumentTypeNames: jest.fn(),
}));
const mockedGet = getDocumentTypeNames as jest.MockedFunction<typeof getDocumentTypeNames>;
const mockedSave = updateDocumentTypeNames as jest.MockedFunction<typeof updateDocumentTypeNames>;

const NONE = {
  NATIONAL_ID: null,
  PASSPORT: null,
  RESIDENCE_PERMIT: null,
  TAX_ID: null,
  OTHER: null,
};
const AMBIGUITY = 'Dos tipos de documento no pueden tener el mismo nombre.';

describe('DocumentTypeNamesSettingsSection (DX-327)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    mockedGet.mockResolvedValue({ ...NONE });
  });

  it('shows five fields in the order of the types, each labelled with its generic name and described by its hint', async () => {
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    await screen.findAllByRole('textbox');
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(5);
    DOC_TYPES.forEach((type, i) => {
      expect(boxes[i]).toHaveAccessibleName(DOC_TYPE_LABEL[type]);
      expect(boxes[i]).toHaveAccessibleDescription(`Vacío: se usa «${DOC_TYPE_LABEL[type]}».`);
      // Sin placeholder que repita el genérico, ni maxLength que cuente UTF-16.
      expect(boxes[i]).not.toHaveAttribute('placeholder');
      expect(boxes[i]).not.toHaveAttribute('maxlength');
    });
  });

  it('saves the five names trimmed, sending null for empty ones', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...NONE, OTHER: 'Carné' });
    mockedSave.mockResolvedValue({ ...NONE, NATIONAL_ID: 'Documento A' });
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const national = await screen.findByLabelText(DOC_TYPE_LABEL.NATIONAL_ID);
    await waitFor(() => expect(screen.getByLabelText(DOC_TYPE_LABEL.OTHER)).toHaveValue('Carné'));
    await user.type(national, '  Documento    A  ');
    await user.type(screen.getByLabelText(DOC_TYPE_LABEL.PASSPORT), '   ');
    await user.clear(screen.getByLabelText(DOC_TYPE_LABEL.OTHER));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { ...NONE, NATIONAL_ID: 'Documento A' }),
    );
    expect(await screen.findByText('Nombres guardados.')).toBeInTheDocument();
  });

  it('shows the ambiguity error from the API next to the form', async () => {
    const user = userEvent.setup();
    mockedSave.mockRejectedValue(new ApiError(400, AMBIGUITY));
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    await user.type(await screen.findByLabelText(DOC_TYPE_LABEL.PASSPORT), 'Doc');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(AMBIGUITY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('counts characters, not UTF-16 units: 60 outside the basic plane fit, 61 do not', async () => {
    const user = userEvent.setup();
    mockedSave.mockResolvedValue({ ...NONE });
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const field = await screen.findByLabelText(DOC_TYPE_LABEL.TAX_ID);
    fireEvent.change(field, { target: { value: '\u{1D49C}'.repeat(61) } });
    expect(field).toHaveValue('\u{1D49C}'.repeat(61));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Hasta 60 caracteres.')).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: '\u{1D49C}'.repeat(60) } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { ...NONE, TAX_ID: '\u{1D49C}'.repeat(60) }),
    );
  });

  it('measures the name after joining spaces, as the API stores it', async () => {
    const user = userEvent.setup();
    mockedSave.mockResolvedValue({ ...NONE });
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const field = await screen.findByLabelText(DOC_TYPE_LABEL.OTHER);
    // 30 + 10 espacios + 29 = 69 al teclear; 60 al guardar.
    fireEvent.change(field, { target: { value: `${'a'.repeat(30)}${' '.repeat(10)}${'b'.repeat(29)}` } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { ...NONE, OTHER: `${'a'.repeat(30)} ${'b'.repeat(29)}` }),
    );
  });

  it('marks every invalid field, focuses the first and clears each error once fixed', async () => {
    const user = userEvent.setup();
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const passport = await screen.findByLabelText(DOC_TYPE_LABEL.PASSPORT);
    const taxId = screen.getByLabelText(DOC_TYPE_LABEL.TAX_ID);
    const other = screen.getByLabelText(DOC_TYPE_LABEL.OTHER);
    fireEvent.change(other, { target: { value: 'x'.repeat(61) } });
    fireEvent.change(passport, { target: { value: 'Pas\u200Baporte' } });
    fireEvent.change(taxId, { target: { value: '---' } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockedSave).not.toHaveBeenCalled();
    expect(passport).toHaveAttribute('aria-invalid', 'true');
    expect(passport).toHaveAccessibleDescription('El nombre del documento no puede llevar caracteres de control.');
    expect(taxId).toHaveAccessibleDescription('El nombre necesita al menos una letra o un número.');
    expect(other).toHaveAccessibleDescription('Hasta 60 caracteres.');
    await waitFor(() => expect(passport).toHaveFocus());

    await user.clear(passport);
    await user.type(passport, 'Pasaporte local');
    expect(passport).not.toHaveAttribute('aria-invalid');
    expect(passport).toHaveAccessibleDescription(`Vacío: se usa «${DOC_TYPE_LABEL.PASSPORT}».`);
    // Los otros dos siguen marcados hasta corregirlos.
    expect(taxId).toHaveAttribute('aria-invalid', 'true');
    expect(other).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears «Nombres guardados.» on the next edit', async () => {
    const user = userEvent.setup();
    mockedSave.mockResolvedValue({ ...NONE, PASSPORT: 'Doc' });
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    await user.type(await screen.findByLabelText(DOC_TYPE_LABEL.PASSPORT), 'Doc');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Nombres guardados.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(DOC_TYPE_LABEL.PASSPORT), 'x');
    expect(screen.queryByText('Nombres guardados.')).not.toBeInTheDocument();
  });

  it('a 404 from an older API reads as a load failure, with retry', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Cannot GET /clinic/document-type-names'));
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    expect(await screen.findByText('No pudimos cargar los nombres de documentos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('a non-admin sees exactly one lock state and nothing is requested', () => {
    render(<DocumentTypeNamesSettingsSection token="tok" allowed={false} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      screen.getByText('Solo un administrador puede cambiar los nombres de los documentos.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('the copy names no country document', () => {
    const source = readFileSync(
      path.join(__dirname, 'document-type-names-settings.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(
      /[Cc][ée]dula|[Tt]arjeta de identidad|[Ee]xtranjer[ií]a|\b(?:CC|TI|CE)\b|INVIMA|countr(?:y|ies)/i,
    );
  });
});
