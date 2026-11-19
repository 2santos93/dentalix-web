import { ApiError } from '@/lib/api/api-error';
import { apiErrorFromBody } from '@/lib/api/client';
import {
  EMPTY_LEAD_FILTERS,
  ambiguousCandidatesOf,
  canScheduleFirstAppointment,
  canUseLeads,
  existingRecordHref,
  leadFiltersHref,
  leadReportRange,
  leadWhatsAppHref,
  listLeads,
  NO_OWNER,
  manualStageTargets,
  parseLeadFilters,
  phoneTakenOf,
  reportFigureHref,
  splitLeadName,
} from './leads-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('leads-api (DX-556)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({} as never);
  });

  it('parte el nombre: la primera palabra es el nombre y el resto, el apellido', () => {
    expect(splitLeadName('María José Pérez Rondón')).toEqual({ firstName: 'María', lastName: 'José Pérez Rondón' });
    expect(splitLeadName('  Luis   Hernández ')).toEqual({ firstName: 'Luis', lastName: 'Hernández' });
    expect(splitLeadName('Yusmary')).toEqual({ firstName: 'Yusmary', lastName: '' });
    expect(splitLeadName('   ')).toEqual({ firstName: '', lastName: '' });
  });

  it('el enlace de WhatsApp es wa.me con los dígitos; sin dígitos válidos, nada', () => {
    expect(leadWhatsAppHref('584121234567')).toBe('https://wa.me/584121234567');
    expect(leadWhatsAppHref(null)).toBeNull();
    expect(leadWhatsAppHref('+58 412')).toBeNull();
  });

  it('solo ADMIN y recepción usan los prospectos', () => {
    expect(canUseLeads('ADMIN')).toBe(true);
    expect(canUseLeads('RECEPTION')).toBe(true);
    expect(canUseLeads('DENTIST')).toBe(false);
    expect(canUseLeads(null)).toBe(false);
  });

  it('«Cita agendada» y «Asistió» nunca se eligen a mano', () => {
    for (const stage of ['NEW', 'CONTACTED', 'SCHEDULED', 'ATTENDED', 'LOST'] as const) {
      expect(manualStageTargets(stage)).not.toContain('SCHEDULED');
      expect(manualStageTargets(stage)).not.toContain('ATTENDED');
    }
    expect(manualStageTargets('NEW')).toEqual(['CONTACTED', 'LOST']);
    expect(manualStageTargets('ATTENDED')).toEqual([]);
    expect(manualStageTargets('LOST')).toEqual(['NEW', 'CONTACTED']);
  });

  it('agendar la primera cita: solo un prospecto abierto y no anonimizado', () => {
    expect(canScheduleFirstAppointment({ stage: 'NEW', anonymized: false })).toBe(true);
    expect(canScheduleFirstAppointment({ stage: 'CONTACTED', anonymized: false })).toBe(true);
    expect(canScheduleFirstAppointment({ stage: 'SCHEDULED', anonymized: false })).toBe(false);
    expect(canScheduleFirstAppointment({ stage: 'NEW', anonymized: true })).toBe(false);
  });

  describe('los 409 con salida propia', () => {
    it('LEAD_PHONE_TAKEN trae quién tiene el número y a dónde abrirlo', () => {
      const patient = apiErrorFromBody(
        409,
        {
          code: 'LEAD_PHONE_TAKEN',
          message: 'Ese teléfono…',
          existing: { kind: 'PATIENT', id: 'p1', name: 'Ana Rojas' },
        },
        null,
      );
      expect(phoneTakenOf(patient)).toEqual({ kind: 'PATIENT', id: 'p1', name: 'Ana Rojas' });
      expect(existingRecordHref(phoneTakenOf(patient)!)).toBe('/patients/p1');

      const lead = apiErrorFromBody(
        409,
        { code: 'LEAD_PHONE_TAKEN', existing: { kind: 'LEAD', id: 'l1', name: 'Luis' } },
        null,
      );
      expect(existingRecordHref(phoneTakenOf(lead)!)).toBe('/prospectos/l1');

      // Otra sede: sin id ni nombre, solo el aviso.
      const other = apiErrorFromBody(
        409,
        { code: 'LEAD_PHONE_TAKEN', existing: { kind: 'LEAD', id: null, name: null } },
        null,
      );
      expect(phoneTakenOf(other)).toEqual({ kind: 'LEAD', id: null, name: null });
      expect(existingRecordHref(phoneTakenOf(other)!)).toBeNull();
    });

    it('LEAD_AMBIGUOUS_PATIENTS trae los candidatos; otro 409 no es ninguno de los dos', () => {
      const err = apiErrorFromBody(
        409,
        {
          code: 'LEAD_AMBIGUOUS_PATIENTS',
          candidates: [{ id: 'a', name: 'Ana Rojas' }, { id: 'b', name: 'Ana Rojas Paz' }, { x: 1 }],
        },
        null,
      );
      expect(ambiguousCandidatesOf(err)).toEqual([
        { id: 'a', name: 'Ana Rojas' },
        { id: 'b', name: 'Ana Rojas Paz' },
      ]);
      expect(phoneTakenOf(err)).toBeNull();
      const plain = new ApiError(409, 'Otra cosa', { code: 'SOMETHING_ELSE' });
      expect(phoneTakenOf(plain)).toBeNull();
      expect(ambiguousCandidatesOf(plain)).toBeNull();
    });
  });

  describe('filtros en la URL', () => {
    it('«Mi día» abre la lista de los sin contactar', () => {
      const f = parseLeadFilters(new URLSearchParams('stale=true'));
      expect(f.view).toBe('lista');
      expect(f.stale).toBe(true);
    });

    it('ida y vuelta sin perder nada; lo vacío no sale en la URL', () => {
      const href = leadFiltersHref({ view: 'lista', q: 'maria', channel: 'INSTAGRAM', ownerId: 'u1', page: 2 });
      expect(href).toBe('/prospectos?vista=lista&q=maria&channel=INSTAGRAM&ownerId=u1&page=2');
      expect(parseLeadFilters(new URLSearchParams(href.split('?')[1]))).toEqual({
        ...EMPTY_LEAD_FILTERS,
        view: 'lista',
        q: 'maria',
        channel: 'INSTAGRAM',
        ownerId: 'u1',
        page: 2,
      });
      expect(leadFiltersHref({})).toBe('/prospectos');
    });

    it('descarta valores desconocidos', () => {
      const f = parseLeadFilters(new URLSearchParams('channel=FAX&stage=WON&reached=NOPE&createdFrom=ayer&page=-3'));
      expect(f).toEqual(EMPTY_LEAD_FILTERS);
    });

    it('la lista pide a la API los mismos filtros', async () => {
      await listLeads('tok', {
        ...EMPTY_LEAD_FILTERS,
        view: 'lista',
        channel: 'WHATSAPP',
        reached: 'ATTENDED',
        createdFrom: '2026-11-01T04:00:00.000Z',
        createdTo: '2026-12-01T04:00:00.000Z',
      });
      expect(mockedFetch).toHaveBeenLastCalledWith(
        '/leads?channel=WHATSAPP&createdFrom=2026-11-01T04%3A00%3A00.000Z&createdTo=2026-12-01T04%3A00%3A00.000Z&reached=ATTENDED&page=1&pageSize=25',
        { token: 'tok' },
      );
    });

    it('«Sin responsable» (ownerId=none) se pide a la API como unowned=true', async () => {
      await listLeads('tok', { ...EMPTY_LEAD_FILTERS, view: 'lista', ownerId: NO_OWNER });
      expect(mockedFetch).toHaveBeenLastCalledWith('/leads?unowned=true&page=1&pageSize=25', { token: 'tok' });
      expect(reportFigureHref({ from: 'a', to: 'b' }, { ownerId: NO_OWNER }, 'SCHEDULED')).toContain('ownerId=none');
    });
  });

  describe('informe', () => {
    it('el período va en instantes [desde, hasta) con la zona de la sede (Caracas, UTC−4)', () => {
      expect(leadReportRange('this_month', '2026-11-18', 'America/Caracas')).toEqual({
        from: '2026-11-01T04:00:00.000Z',
        to: '2026-11-19T04:00:00.000Z',
      });
      expect(leadReportRange('last_month', '2026-11-18', 'America/Caracas')).toEqual({
        from: '2026-10-01T04:00:00.000Z',
        to: '2026-11-01T04:00:00.000Z',
      });
      expect(leadReportRange('last_30_days', '2026-11-18', 'America/Caracas')).toEqual({
        from: '2026-10-20T04:00:00.000Z',
        to: '2026-11-19T04:00:00.000Z',
      });
    });

    it('cada cifra lleva a la lista con el mismo período, la fila y `reached`', () => {
      const range = { from: '2026-11-01T04:00:00.000Z', to: '2026-11-19T04:00:00.000Z' };
      const href = reportFigureHref(range, { channel: 'INSTAGRAM' }, 'SCHEDULED');
      const f = parseLeadFilters(new URLSearchParams(href.split('?')[1]));
      expect(f).toMatchObject({
        view: 'lista',
        channel: 'INSTAGRAM',
        ownerId: null,
        reached: 'SCHEDULED',
        createdFrom: range.from,
        createdTo: range.to,
      });
      expect(
        parseLeadFilters(new URLSearchParams(reportFigureHref(range, { ownerId: 'u9' }, null).split('?')[1])),
      ).toMatchObject({
        view: 'lista',
        ownerId: 'u9',
        reached: null,
      });
    });
  });
});
