import { render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { apiErrorFromBody } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getPatient } from '@/lib/patients/patients-api';
import { mergedPatientCopy } from '@/lib/patients/merged-patient';
import { tokenFor } from '@/lib/test/prescriptions';
import PatientDetailPage from './page';

const replace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/patients/absorbed-1',
  useSearchParams: () => new URLSearchParams(mockSearch),
  useParams: () => ({ id: 'absorbed-1' }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn(), info: jest.fn() } }));
jest.mock('../../../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../../../lib/patients/patients-api'),
  getPatient: jest.fn(),
}));
// La ficha monta muchos bloques que piden sus datos; aquí solo importa la carga del paciente.
global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

const mockedGet = getPatient as jest.MockedFunction<typeof getPatient>;

describe('Ficha de un paciente fusionado (DX-266)', () => {
  beforeEach(() => {
    replace.mockReset();
    mockedGet.mockReset();
    useAuthStore.setState({ accessToken: tokenFor('ADMIN', 'u-admin'), _hasHydrated: true });
  });

  it('el 404 PATIENT_MERGED lleva (replace) a la ficha del conservado con la misma pestaña', async () => {
    window.history.replaceState(null, '', '/patients/absorbed-1?tab=plan');
    mockSearch = 'tab=plan';
    mockedGet.mockRejectedValue(
      apiErrorFromBody(
        404,
        {
          statusCode: 404,
          code: 'PATIENT_MERGED',
          mergedIntoId: 'kept-1',
          message: 'Este paciente se fusionó con otro; su ficha es ahora la del paciente que se conservó.',
        },
        null,
      ),
    );
    render(<PatientDetailPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/patients/kept-1?tab=plan'));
    expect(toast.info).toHaveBeenCalledWith(mergedPatientCopy.redirected);
    expect(screen.getByText(mergedPatientCopy.redirecting)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un 404 corriente sigue siendo un error de sección, sin redirigir', async () => {
    window.history.replaceState(null, '', '/patients/absorbed-1');
    mockSearch = '';
    mockedGet.mockRejectedValue(apiErrorFromBody(404, { statusCode: 404, message: 'Paciente no encontrado' }, null));
    render(<PatientDetailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Paciente no encontrado');
    expect(replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/patients\//));
  });
});
