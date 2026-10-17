import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_OPTIONS,
  AUDIT_RESOURCE_LABELS,
  AUDIT_RESOURCE_OPTIONS,
  actorRoleLabel,
  communicationDetail,
  isPatientOptOut,
} from './audit-labels';

describe('etiquetas de auditoría', () => {
  it('cada acción y cada recurso tienen etiqueta en español', () => {
    for (const action of AUDIT_ACTION_OPTIONS) {
      expect(AUDIT_ACTION_LABELS[action]).toMatch(/\S/);
    }
    for (const resource of AUDIT_RESOURCE_OPTIONS) {
      expect(AUDIT_RESOURCE_LABELS[resource]).toMatch(/\S/);
    }
    expect(AUDIT_ACTION_LABELS.LOGIN_FAILED).toBe('Inicio de sesión fallido');
    expect(AUDIT_ACTION_LABELS.PASSWORD_RESET).toBe('Contraseña restablecida');
    expect(AUDIT_RESOURCE_LABELS.MEDICAL_HISTORY).toBe('Historia clínica');
    // DX-136: ver, reimprimir y enviar el recibo de caja.
    expect(AUDIT_ACTION_LABELS.SEND).toBe('Envío por email');
    expect(AUDIT_RESOURCE_LABELS.PAYMENT_RECEIPT).toBe('Recibo de caja');
  });

  it('las opciones no repiten valores', () => {
    expect(new Set(AUDIT_ACTION_OPTIONS).size).toBe(AUDIT_ACTION_OPTIONS.length);
    expect(new Set(AUDIT_RESOURCE_OPTIONS).size).toBe(AUDIT_RESOURCE_OPTIONS.length);
  });

  it('rol del actor', () => {
    expect(actorRoleLabel('RECEPTION')).toBe('Recepción');
    expect(actorRoleLabel(null)).toBe('Sin sesión');
  });

  // DX-128: cambios de comunicación y baja de recordatorios.
  it('describe el cambio de comunicación con su origen', () => {
    expect(
      communicationDetail({ reason: 'COMMUNICATION_PREFERENCES_CHANGED', origin: 'IN_PERSON' }),
    ).toBe('Comunicaciones · en persona');
    expect(communicationDetail({ reason: 'REMINDER_OPT_OUT', origin: 'LINK' })).toBe(
      'Baja de recordatorios · con el enlace del email',
    );
    expect(communicationDetail({ reason: 'REMINDER_OPT_OUT', origin: 'MESSAGE' })).toBe(
      'Baja de recordatorios · respondiendo al mensaje',
    );
    expect(communicationDetail({ reason: 'COMMUNICATION_PREFERENCES_CHANGED', origin: 'STAFF' })).toBe(
      'Comunicaciones · anotado por el personal',
    );
    expect(communicationDetail({ reason: 'PARTIAL_SUPPRESSION' })).toBeNull();
    expect(communicationDetail({})).toBeNull();
  });

  it('reconoce la baja que hizo el propio paciente', () => {
    expect(isPatientOptOut({ reason: 'REMINDER_OPT_OUT', origin: 'LINK' })).toBe(true);
    expect(isPatientOptOut({ reason: 'COMMUNICATION_PREFERENCES_CHANGED' })).toBe(false);
  });
});
