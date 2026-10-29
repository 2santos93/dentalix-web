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

  it('shows five fields in the order of the types, each with its generic name as label and placeholder', async () => {
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    await screen.findAllByRole('textbox');
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(5);
    DOC_TYPES.forEach((type, i) => {
      expect(boxes[i]).toHaveAccessibleName(DOC_TYPE_LABEL[type]);
      expect(boxes[i]).toHaveAttribute('placeholder', DOC_TYPE_LABEL[type]);
      expect(boxes[i]).toHaveAttribute('maxlength', '60');
    });
    expect(screen.getByText(`Vacío: se usa «${DOC_TYPE_LABEL.PASSPORT}».`)).toBeInTheDocument();
  });

  it('saves the five names trimmed, sending null for empty ones', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...NONE, OTHER: 'Carné' });
    mockedSave.mockResolvedValue({ ...NONE, NATIONAL_ID: 'Documento A' });
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const national = await screen.findByLabelText(DOC_TYPE_LABEL.NATIONAL_ID);
    await waitFor(() => expect(screen.getByLabelText(DOC_TYPE_LABEL.OTHER)).toHaveValue('Carné'));
    await user.type(national, '  Documento A  ');
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

  it('rejects a name over 60 characters', async () => {
    const user = userEvent.setup();
    render(<DocumentTypeNamesSettingsSection token="tok" allowed />);
    const field = await screen.findByLabelText(DOC_TYPE_LABEL.TAX_ID);
    // maxLength no ataja un valor pegado/programático: se valida también al guardar.
    fireEvent.change(field, { target: { value: 'x'.repeat(61) } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Hasta 60 caracteres.')).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
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
