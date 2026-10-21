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

  it('«Sin cambios hoy» confirmado hoy (día local)', () => {
    const now = new Date('2026-10-20T15:00:00.000Z');
    expect(confirmedToday({ kind: 'NO_CHANGES', at: '2026-10-20T08:00:00.000Z', byName: 'X' }, now)).toBe(true);
    expect(confirmedToday({ kind: 'NO_CHANGES', at: '2026-10-19T08:00:00.000Z', byName: 'X' }, now)).toBe(false);
    expect(confirmedToday({ kind: 'UPDATED', at: '2026-10-20T08:00:00.000Z', byName: 'X' }, now)).toBe(false);
    expect(confirmedToday(null, now)).toBe(false);
    // Una versión guardada hoy también es una revisión de hoy.
    expect(reviewedToday({ kind: 'UPDATED', at: '2026-10-20T08:00:00.000Z', byName: 'X' }, now)).toBe(true);
    expect(reviewedToday(null, now)).toBe(false);
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
