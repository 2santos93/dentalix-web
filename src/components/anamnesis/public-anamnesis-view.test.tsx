import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PublicAnamnesisView } from './public-anamnesis-view';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import {
  getPublicAnamnesis,
  submitPublicAnamnesis,
  type PublicAnamnesis,
} from '@/lib/anamnesis/anamnesis-api';

jest.mock('../../lib/anamnesis/anamnesis-api', () => ({
  ...jest.requireActual('../../lib/anamnesis/anamnesis-api'),
  getPublicAnamnesis: jest.fn(),
  submitPublicAnamnesis: jest.fn(),
}));

const mockedGet = getPublicAnamnesis as jest.MockedFunction<typeof getPublicAnamnesis>;
const mockedSubmit = submitPublicAnamnesis as jest.MockedFunction<typeof submitPublicAnamnesis>;

function fixture(overrides: Partial<PublicAnamnesis> = {}): PublicAnamnesis {
  return {
    clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#0E7490' },
    patientFirstName: 'Mariana',
    expiresAt: '2026-10-30T15:00:00.000Z',
    consent: { required: false, policy: null },
    questionnaire: {
      version: '2026-10-v1',
      answers: ['SI', 'NO', 'NO_SE'],
      answerLabels: { SI: 'Sí', NO: 'No', NO_SE: 'No sé' },
      allergyTypes: [{ value: 'MEDICAMENTO', label: 'Medicamento' }],
      allergySeverities: [{ value: 'MODERADA', label: 'Moderada o no lo sé' }],
      limits: { text: 200, note: 500, listItems: 20, weeks: 45, perDay: 200 },
      declaration: 'Declaro que la información es verdadera.',
      sections: [
        {
          key: 'allergies',
          title: 'Alergias',
          questions: [
            {
              key: 'allergies',
              label: '¿Tiene alguna alergia?',
              followUp: { kind: 'ALLERGY_LIST', label: 'Escriba cada alergia', required: true },
            },
          ],
        },
        {
          key: 'conditions',
          title: 'Enfermedades',
          questions: [{ key: 'condition:DIABETES', label: '¿Tiene diabetes?' }],
        },
      ],
    },
    ...overrides,
  };
}

function answer(question: string, option: 'Sí' | 'No' | 'No sé') {
  const group = screen.getByRole('radiogroup', { name: question });
  fireEvent.click(within(group).getByRole('radio', { name: option }));
}

describe('PublicAnamnesisView (DX-099)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSubmit.mockReset();
  });

  it('carga con esqueleto y saluda solo con el nombre de pila y la clínica', async () => {
    mockedGet.mockResolvedValue(fixture());
    render(<PublicAnamnesisView linkToken="tok" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    expect(await screen.findByRole('heading', { level: 1, name: 'Cuestionario de salud' })).toBeInTheDocument();
    expect(screen.getByText('Hola, Mariana.')).toBeInTheDocument();
    expect(screen.getByText('Clínica Sonrisas')).toBeInTheDocument();
    // Nada precargado: ninguna respuesta marcada.
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it('caducado, anulado o ya usado (410) → «Este enlace ya no es válido, contacte con su clínica.»', async () => {
    mockedGet.mockRejectedValue(new ApiError(410, 'gone'));
    render(<PublicAnamnesisView linkToken="tok" />);
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no es válido' })).toBeInTheDocument();
    expect(screen.getByText('Este enlace ya no es válido, contacte con su clínica.')).toBeInTheDocument();
  });

  it('error de red al cargar → «Reintentar» vuelve a pedirlo', async () => {
    mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch'))).mockResolvedValueOnce(fixture());
    render(<PublicAnamnesisView linkToken="tok" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Hola, Mariana.')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('sin autorización vigente la pide antes del cuestionario, con el texto de la clínica', async () => {
    mockedGet.mockResolvedValue(
      fixture({
        consent: {
          required: true,
          policy: { id: 'pol-1', version: 2, sensitiveHealthText: 'Autorizo mis datos de salud.', policyText: 'Política.' },
        },
      }),
    );
    render(<PublicAnamnesisView linkToken="tok" />);
    expect(await screen.findByText('Autorizo mis datos de salud.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Para continuar debe autorizar el tratamiento de sus datos de salud.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('radiogroup', { name: '¿Tiene alguna alergia?' })).toBeInTheDocument();

    answer('¿Tiene alguna alergia?', 'No');
    answer('¿Tiene diabetes?', 'No sé');
    fireEvent.click(screen.getByRole('checkbox', { name: /verdadera/ }));
    mockedSubmit.mockResolvedValue({ submittedAt: '2026-10-23T15:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuestas' }));
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalled());
    expect(mockedSubmit.mock.calls[0][1].consent).toEqual({ policyVersionId: 'pol-1', granted: true });
  });

  it('valida en español, abre el seguimiento al contestar «Sí» y deshabilita el botón mientras envía', async () => {
    mockedGet.mockResolvedValue(fixture());
    render(<PublicAnamnesisView linkToken="tok" />);
    await screen.findByText('Hola, Mariana.');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuestas' }));
    expect(screen.getAllByText('Elija Sí, No o No sé.')).toHaveLength(2);
    expect(screen.getByText('Marque la casilla para confirmar que la información es verdadera.')).toBeInTheDocument();
    expect(screen.getByText(/Faltan 3 datos por completar/)).toBeInTheDocument();
    expect(mockedSubmit).not.toHaveBeenCalled();

    answer('¿Tiene alguna alergia?', 'Sí');
    fireEvent.change(screen.getByLabelText('¿A qué es alérgico?'), { target: { value: 'Penicilina' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'MEDICAMENTO' } });
    answer('¿Tiene diabetes?', 'No');
    fireEvent.click(screen.getByRole('checkbox', { name: /verdadera/ }));

    let resolve: (v: { submittedAt: string }) => void = () => undefined;
    mockedSubmit.mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuestas' }));
    expect(await screen.findByRole('button', { name: /Enviando/ })).toBeDisabled();
    const body = mockedSubmit.mock.calls[0][1];
    expect(body.answers.allergies).toEqual({
      answer: 'SI',
      items: [{ alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'MODERADA' }],
    });
    expect(body.consent).toBeUndefined();
    resolve({ submittedAt: '2026-10-23T15:00:00.000Z' });
    expect(await screen.findByRole('heading', { name: '¡Gracias! Recibimos sus respuestas' })).toBeInTheDocument();
  });

  it('si al enviar el enlace ya no vale (410) muestra el aviso; si falla la red, un error con reintento', async () => {
    mockedGet.mockResolvedValue(fixture());
    render(<PublicAnamnesisView linkToken="tok" />);
    await screen.findByText('Hola, Mariana.');
    answer('¿Tiene alguna alergia?', 'No');
    answer('¿Tiene diabetes?', 'No');
    fireEvent.click(screen.getByRole('checkbox', { name: /verdadera/ }));
    mockedSubmit.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuestas' }));
    expect(
      await screen.findByText('No pudimos enviar sus respuestas. Revise su conexión e intente de nuevo.'),
    ).toBeInTheDocument();
    mockedSubmit.mockRejectedValueOnce(new ApiError(410, 'gone'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuestas' }));
    expect(await screen.findByText('Este enlace ya no es válido, contacte con su clínica.')).toBeInTheDocument();
  });
});
