import { render, screen } from '@testing-library/react';
import { VoidDocumentModal } from './void-document-modal';
import { voidPatientDocument } from '@/lib/patient-documents/patient-documents-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeDocument } from '@/lib/test/patient-documents';

jest.mock('../../lib/patient-documents/patient-documents-api', () => ({
  ...jest.requireActual('../../lib/patient-documents/patient-documents-api'),
  voidPatientDocument: jest.fn(),
}));

const mockedVoid = voidPatientDocument as jest.MockedFunction<typeof voidPatientDocument>;

describe('VoidDocumentModal (DX-151)', () => {
  beforeEach(() => mockedVoid.mockReset());

  it('exige un motivo de al menos 3 caracteres, anula y cierra', async () => {
    const user = setupUser();
    const onOpenChange = jest.fn();
    const onVoided = jest.fn();
    const voided = makeDocument({ voidedAt: '2026-10-12T00:00:00Z' });
    mockedVoid.mockResolvedValue(voided);
    render(
      <VoidDocumentModal open onOpenChange={onOpenChange} token="T" document={makeDocument()} onVoided={onVoided} />,
    );
    const submit = screen.getByRole('button', { name: 'Anular documento' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo de la anulación'), 'ab');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo de la anulación'), 'c ');
    await user.click(submit);
    expect(mockedVoid).toHaveBeenCalledWith('T', 'p1', 'doc-1', 'abc');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onVoided).toHaveBeenCalledWith(voided);
  });

  it('un 403 de la API se muestra en el formulario', async () => {
    const user = setupUser();
    mockedVoid.mockRejectedValue(new ApiError(403, 'Solo quien lo subió o un administrador puede anularlo.'));
    render(<VoidDocumentModal open onOpenChange={jest.fn()} token="T" document={makeDocument()} onVoided={jest.fn()} />);
    await user.type(screen.getByLabelText('Motivo de la anulación'), 'Duplicado');
    await user.click(screen.getByRole('button', { name: 'Anular documento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo quien lo subió o un administrador puede anularlo.',
    );
  });
});
