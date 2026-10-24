import {
  attendanceBadgeText,
  cancellationSummary,
  formatNotice,
  lateCancellationWarning,
} from './cancellation';

describe('cancelaciones (DX-279)', () => {
  it('formatea el aviso en horas y minutos', () => {
    expect(formatNotice(300)).toBe('5 h');
    expect(formatNotice(45)).toBe('45 min');
    expect(formatNotice(330)).toBe('5 h 30 min');
    expect(formatNotice(0)).toBe('0 min');
  });

  it('avisa de la cancelación tardía con el texto del criterio', () => {
    expect(
      lateCancellationWarning({
        appointmentId: 'a',
        noticeMinutes: 300,
        lateCancellation: true,
        policy: { id: 'p', version: 1, noticeHours: 24 },
      }),
    ).toBe('Cancelación tardía: aviso de 5 h, la política pide 24 h');
    expect(
      lateCancellationWarning({ appointmentId: 'a', noticeMinutes: 3000, lateCancellation: false, policy: null }),
    ).toBeNull();
    expect(lateCancellationWarning(null)).toBeNull();
  });

  it('la insignia dice solo lo que hay, en singular o plural, y nada sin incidencias', () => {
    expect(attendanceBadgeText({ noShows: 2, lateCancellations: 1 })).toBe(
      '2 inasistencias · 1 cancelación tardía (12 meses)',
    );
    expect(attendanceBadgeText({ noShows: 1, lateCancellations: 0 })).toBe('1 inasistencia (12 meses)');
    expect(attendanceBadgeText({ noShows: 0, lateCancellations: 3 })).toBe(
      '3 cancelaciones tardías (12 meses)',
    );
    expect(attendanceBadgeText({ noShows: 0, lateCancellations: 0 })).toBeNull();
    expect(attendanceBadgeText(undefined)).toBeNull();
  });

  it('resume la cancelación de la cita (o nada en las antiguas)', () => {
    expect(
      cancellationSummary({
        cancelledByKind: 'STAFF_FOR_PATIENT',
        cancelReasonCode: 'ILLNESS',
        noticeMinutes: 300,
        lateCancellation: true,
      }),
    ).toBe('El paciente avisa · Enfermedad · aviso de 5 h · tardía');
    expect(cancellationSummary({ cancelledByKind: null })).toBeNull();
  });
});
