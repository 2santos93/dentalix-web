import {
  canEditCommunication,
  getPatientCommunication,
  getPatientOptOutWarnings,
  updatePatientCommunication,
  withCommunication,
  type PatientCommunication,
} from './communication-api';
import type { Patient } from './patients-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('communication-api (DX-128)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lee el bloque del paciente', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await getPatientCommunication('tok', 'p 1');
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p%201/communication', { token: 'tok' });
  });

  it('lo cambia con PATCH', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await updatePatientCommunication('tok', 'p1', { contactChannel: 'NONE' });
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p1/communication', {
      method: 'PATCH',
      body: { contactChannel: 'NONE' },
      token: 'tok',
    });
  });

  it('solo recepción y ADMIN editan', () => {
    expect(canEditCommunication('RECEPTION')).toBe(true);
    expect(canEditCommunication('ADMIN')).toBe(true);
    expect(canEditCommunication('DENTIST')).toBe(false);
    expect(canEditCommunication('ASSISTANT')).toBe(false);
    expect(canEditCommunication(null)).toBe(false);
  });

  it('lleva a la ficha lo que cambió el bloque, sin tocar el resto', () => {
    const patient = { id: 'p1', firstName: 'Ana', phone: null, email: 'a@x.co' } as unknown as Patient;
    const saved: PatientCommunication = {
      patientId: 'p1',
      contactChannel: 'WHATSAPP',
      clinicDefaultChannel: 'EMAIL',
      phone: '+573101234567',
      phoneE164: '+573101234567',
      phoneStatus: 'VALID',
      phoneAmbiguous: false,
      phoneInternational: '+57 310 1234567',
      phoneCountry: 'CO',
      email: 'a@x.co',
      whatsappOptIn: {
        at: '2026-10-17T10:00:00.000Z',
        source: 'IN_PERSON',
        recordedBy: { id: 'u1', fullName: 'Rosa' },
      },
      reminderOptOut: { at: '2026-10-17T11:00:00.000Z', source: 'STAFF' },
      recipient: {
        kind: 'PATIENT',
        name: 'Ana',
        email: null,
        minor: false,
        responsiblePartyId: null,
      },
    };
    expect(withCommunication(patient, saved)).toEqual({
      ...patient,
      phone: '+573101234567',
      contactChannel: 'WHATSAPP',
      whatsappOptInAt: '2026-10-17T10:00:00.000Z',
      whatsappOptInSource: 'IN_PERSON',
      whatsappOptInById: 'u1',
      reminderOptOutAt: '2026-10-17T11:00:00.000Z',
      reminderOptOutSource: 'STAFF',
    });
  });
});

it('consulta avisos con paciente codificado y token de clínica', async () => {
  mockedFetch.mockResolvedValue([]);
  await getPatientOptOutWarnings('tok', 'p 1');
  expect(mockedFetch).toHaveBeenCalledWith('/patients/p%201/communication/opt-out-warnings', { token: 'tok' });
});
