import { act, render, screen } from '@testing-library/react';
import { RegisterImplantModal } from './register-implant-modal';
import { getImplantCatalog } from '@/lib/implants/implants-api';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  getImplantCatalog: jest.fn(),
  registerImplant: jest.fn(),
}));
const mockedCatalog = getImplantCatalog as jest.MockedFunction<typeof getImplantCatalog>;

describe('RegisterImplantModal (DX-327)', () => {
  beforeEach(() => mockedCatalog.mockReset().mockResolvedValue([]));

  it('the sanitary registration label names no authority', async () => {
    render(
      <RegisterImplantModal open onOpenChange={() => {}} token="tok" patientId="p1" onRegistered={() => {}} />,
    );
    const field = screen.getByLabelText('Registro sanitario o certificación del producto');
    expect(field).toBeInTheDocument();
    const dialog = field.closest('[role="dialog"]') ?? document.body;
    expect(dialog.textContent).not.toMatch(/INVIMA|marcado CE|\bCE\b/);
    // Deja resolver la carga de sugerencias dentro de act.
    await act(async () => {});
  });
});
