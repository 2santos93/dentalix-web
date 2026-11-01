import {
  ANAMNESIS_EXPIRED_LABEL,
  ANAMNESIS_MISSING_LABEL,
  PREMEDICATION_LABEL,
  SAFETY_FLAG_LABELS,
  anamnesisNote,
  canConfirmAnamnesis,
  canManageAnamnesisSettings,
  confirmedToday,
  medicalAlertHeadline,
  medicalAlertLines,
  medicalAlertSeverity,
  medicalAlertSummary,
  reviewedToday,
  sedeDateLabel,
  sedeTimeLabel,
  type MedicalAlertFlags,
} from './medical-alerts';

const flags = (over: Partial<MedicalAlertFlags> = {}): MedicalAlertFlags => ({
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'CURRENT',
  alerts: [],
  anamnesisReviewedAt: '2026-09-01T12:00:00.000Z',
  ...over,
});

describe('medical-alerts (DX-247)', () => {
  it('usa las mismas etiquetas que el banner de la ficha', () => {
    expect(
      medicalAlertLines(
        flags({ hasCriticalAlert: true, alerts: ['profilaxisAntibiotica', 'alergiaLatex'] }),
      ),
    ).toEqual([SAFETY_FLAG_LABELS.profilaxisAntibiotica, SAFETY_FLAG_LABELS.alergiaLatex]);
    expect(SAFETY_FLAG_LABELS.profilaxisAntibiotica).toBe('Requiere profilaxis antibiótica');
  });

  it('una alergia marcada sin bandera propia se nombra sin el alérgeno', () => {
    expect(medicalAlertLines(flags({ hasCriticalAlert: true, alerts: ['alergiaMarcada'] }))).toEqual([
      'Alergia marcada como alerta (detalle en la ficha)',
    ]);
  });

  it('una alerta sin códigos (anamnesis antigua) no se calla', () => {
    expect(medicalAlertLines(flags({ hasCriticalAlert: true }))).toEqual([
      'Alerta médica registrada (detalle en la ficha)',
    ]);
  });

  it('gravedad: alerta > anamnesis caducada o ausente > nada', () => {
    expect(medicalAlertSeverity(flags({ hasCriticalAlert: true, anamnesisStatus: 'EXPIRED' }))).toBe('critical');
    expect(medicalAlertSeverity(flags({ anamnesisStatus: 'EXPIRED' }))).toBe('attention');
    expect(medicalAlertSeverity(flags({ anamnesisStatus: 'MISSING' }))).toBe('attention');
    expect(medicalAlertSeverity(flags())).toBeNull();
    expect(medicalAlertSeverity(undefined)).toBeNull();
  });

  it('«Sin anamnesis» y «Anamnesis caducada», nunca «sin alertas»', () => {
    expect(anamnesisNote(flags({ anamnesisStatus: 'MISSING', anamnesisReviewedAt: null }))).toBe(
      ANAMNESIS_MISSING_LABEL,
    );
    expect(anamnesisNote(flags({ anamnesisStatus: 'EXPIRED' }))).toBe(
      `${ANAMNESIS_EXPIRED_LABEL} · última revisión 01/09/2026`,
    );
    expect(anamnesisNote(flags())).toBeNull();
  });

  it('el resumen accesible junta premedicación, alertas y anamnesis', () => {
    expect(
      medicalAlertSummary(
        flags({
          hasCriticalAlert: true,
          requiresPremedication: true,
          alerts: ['profilaxisAntibiotica'],
          anamnesisStatus: 'EXPIRED',
        }),
      ),
    ).toBe(`${PREMEDICATION_LABEL} · Requiere profilaxis antibiótica · ${ANAMNESIS_EXPIRED_LABEL}`);
    expect(medicalAlertSummary(flags({ anamnesisStatus: 'MISSING' }))).toBe(ANAMNESIS_MISSING_LABEL);
    expect(medicalAlertSummary(flags())).toBe('');
  });

  it('titular de la cabecera: premedicación > alertas > caducada > sin anamnesis', () => {
    expect(medicalAlertHeadline(flags({ hasCriticalAlert: true, requiresPremedication: true }))).toBe(PREMEDICATION_LABEL);
    expect(medicalAlertHeadline(flags({ hasCriticalAlert: true }))).toBe('Alertas médicas');
    expect(medicalAlertHeadline(flags({ anamnesisStatus: 'EXPIRED' }))).toBe(ANAMNESIS_EXPIRED_LABEL);
    expect(medicalAlertHeadline(flags({ anamnesisStatus: 'MISSING' }))).toBe(ANAMNESIS_MISSING_LABEL);
    expect(medicalAlertHeadline(flags())).toBeNull();
  });

  it('«hoy» es el de la sede, no el del navegador', () => {
    const sede = { today: '2026-10-20', timeZone: 'America/Bogota' };
    // 23:30 del 20/10 en la sede (04:30 UTC del 21/10): hoy en la sede.
    const late = { kind: 'NO_CHANGES' as const, at: '2026-10-21T04:30:00.000Z', byName: 'X' };
    expect(confirmedToday(late, sede)).toBe(true);
    expect(confirmedToday(late, { today: '2026-10-21', timeZone: 'UTC' })).toBe(true);
    expect(confirmedToday({ ...late, at: '2026-10-19T15:00:00.000Z' }, sede)).toBe(false);
    expect(confirmedToday({ ...late, kind: 'UPDATED' }, sede)).toBe(false);
    expect(confirmedToday(null, sede)).toBe(false);
    // Una versión guardada hoy también es una revisión de hoy.
    expect(reviewedToday({ ...late, kind: 'UPDATED' }, sede)).toBe(true);
    expect(reviewedToday(null, sede)).toBe(false);
    expect(sedeDateLabel(late.at, sede.timeZone)).toBe('20/10/2026');
    expect(sedeTimeLabel(late.at, sede.timeZone)).toBe('23:30');
  });

  it('roles: «Sin cambios hoy» los clínicos; la vigencia, solo ADMIN', () => {
    expect(canConfirmAnamnesis('DENTIST')).toBe(true);
    expect(canConfirmAnamnesis('ASSISTANT')).toBe(true);
    expect(canConfirmAnamnesis('RECEPTION')).toBe(false);
    expect(canConfirmAnamnesis(null)).toBe(false);
    expect(canManageAnamnesisSettings('ADMIN')).toBe(true);
    expect(canManageAnamnesisSettings('DENTIST')).toBe(false);
  });
});
