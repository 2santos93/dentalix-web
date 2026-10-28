import {
  cancellationDetail,
  importBatchDetail,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_OPTIONS,
  AUDIT_RESOURCE_LABELS,
  AUDIT_RESOURCE_OPTIONS,
  actorRoleLabel,
  communicationDetail,
  implantSearchDetail,
  isPatientOptOut,
  staffLoginDetail,
  cashSessionDetail,
  scheduleChangeDetail,
  patientFlowDetail,
  planItemAttributionDetail,
  healthRegistrationDetail,
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
    // DX-222: plantillas y entregas de indicaciones postoperatorias.
    expect(AUDIT_RESOURCE_LABELS.POSTOP_TEMPLATE).toBe('Plantilla de indicaciones');
    expect(AUDIT_RESOURCE_LABELS.POSTOP_DELIVERY).toBe('Indicaciones postoperatorias');
    expect(AUDIT_RESOURCE_LABELS.PATIENT_DOCUMENT).toBe('Documento del paciente');
  });

  it('labels PAYMENT_ALLOCATION as Imputación de abono', () => {
    // DX-051: un ADMIN reasigna a qué ítems va un abono.
    expect(AUDIT_RESOURCE_LABELS.PAYMENT_ALLOCATION).toBe('Imputación de abono');
  });

  it('AUDIT_RESOURCE_LABELS.CLINIC_SETTINGS is Ajustes de la clínica', () => {
    // DX-328: la mayoría de edad de la clínica se audita como ajuste de la clínica.
    expect(AUDIT_RESOURCE_LABELS.CLINIC_SETTINGS).toBe('Ajustes de la clínica');
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

describe('implantSearchDetail (DX-191)', () => {
  it('resume lo buscado y las filas', () => {
    expect(implantSearchDetail({ search: { lot: 'LOT-1', rows: 2 } })).toBe('Lote LOT-1 · 2 filas');
    expect(implantSearchDetail({ search: { reference: '021.5310', rows: 1 } })).toBe(
      'REF 021.5310 · 1 fila',
    );
    expect(implantSearchDetail({})).toBeNull();
  });

  // DX-213: el desbloqueo del login y su rechazo son los dos `Modificación`
  // de un miembro: sin el motivo, un rechazo se leería como un desbloqueo.
  it('distingue el desbloqueo del login de su rechazo', () => {
    expect(staffLoginDetail({ reason: 'LOGIN_UNLOCKED' })).toBe('Desbloqueo del inicio de sesión');
    expect(staffLoginDetail({ reason: 'LOGIN_UNLOCK_REFUSED' })).toBe(
      'Desbloqueo del inicio de sesión rechazado (sin cambios)',
    );
    expect(staffLoginDetail({ reason: 'REMINDER_OPT_OUT' })).toBeNull();
    expect(staffLoginDetail({})).toBeNull();
  });
});

describe('cashSessionDetail (DX-027)', () => {
  it('nombra cierre, reapertura y ajuste; null fuera de la caja', () => {
    expect(cashSessionDetail({ reason: 'CASH_SESSION_CLOSED' })).toBe('Cierre de caja');
    expect(cashSessionDetail({ reason: 'CASH_SESSION_REOPENED' })).toBe('Reapertura de caja');
    expect(cashSessionDetail({ reason: 'LOGIN_UNLOCKED' })).toBeNull();
  });

  it('DX-200: un paso del flujo en la clínica dice el estado antes y después', () => {
    expect(
      patientFlowDetail({ reason: 'PATIENT_FLOW', status: { from: 'CONFIRMED', to: 'ARRIVED' } }),
    ).toBe('Flujo en la clínica · Confirmada → En espera');
    expect(
      patientFlowDetail({ reason: 'ARRIVAL_UNDONE', status: { from: 'ARRIVED', to: 'SCHEDULED' } }),
    ).toBe('Deshacer llegada · En espera → Agendada');
    expect(patientFlowDetail({ reason: 'APPOINTMENT_MOVED' })).toBeNull();
  });
});

describe('scheduleChangeDetail (DX-233)', () => {
  it('semanal: antes y después por día', () => {
    expect(
      scheduleChangeDetail({
        scheduleChange: {
          before: [],
          after: [
            { locationId: 'a', weekday: 1, startMinute: 480, endMinute: 780 },
            { locationId: 'b', weekday: 4, startMinute: 840, endMinute: 1140 },
          ],
        },
      }),
    ).toBe('Antes: sin horario · Después: lun 08:00–13:00, jue 14:00–19:00');
  });
  it('excepción: fecha y «no trabaja»', () => {
    expect(
      scheduleChangeDetail({
        scheduleChange: {
          before: [{ locationId: 'b', date: '2026-10-22', startMinute: 840, endMinute: 1140 }],
          after: [{ locationId: 'b', date: '2026-10-22', off: true }],
        },
      }),
    ).toBe('Antes: 22/10 14:00–19:00 · Después: 22/10 no trabaja');
  });
  it('sin cambio de horario, null', () => {
    expect(scheduleChangeDetail({})).toBeNull();
  });
});

describe('importBatchDetail (DX-107)', () => {
  const sha = 'abcdef0123456789'.repeat(4);

  it('describe la validación con sus totales y el inicio del hash', () => {
    expect(
      importBatchDetail({
        reason: 'IMPORT_VALIDATED',
        importBatch: { fileSha256: sha, rows: 10, valid: 7, duplicates: 2, errors: 1 },
      }),
    ).toBe('Validación del archivo · 10 filas · 7 nuevos · 2 duplicados · 1 con error · SHA-256 abcdef012345…');
  });

  it('el deshacer dice cuánto retiró y revirtió', () => {
    expect(
      importBatchDetail({ reason: 'IMPORT_UNDONE', importBatch: { fileSha256: sha, undoneCreated: 3, undoneFilled: 1 } }),
    ).toBe('Lote deshecho · 3 retirados · 1 revertidos · SHA-256 abcdef012345…');
    expect(importBatchDetail({ reason: 'IMPORT_ERRORS' })).toBe('Informe de errores');
    expect(importBatchDetail({ reason: 'CASH_SETTINGS' })).toBeNull();
  });
});

describe('planItemAttributionDetail (DX-050)', () => {
  const before = {
    performedById: '11111111-1111-4111-8111-111111111111',
    locationId: '33333333-3333-4333-8333-333333333333',
    completedAt: '2026-10-20T15:00:00.000Z',
  };

  it('la corrección dice qué cambió: el profesional y, si cambió, la fecha', () => {
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_ATTRIBUTION_CORRECTED',
        attribution: { before, after: { ...before, performedById: '22222222-2222-4222-8222-222222222222' } },
      }),
    ).toBe('Corrección de quién lo realizó · Otro profesional');
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_ATTRIBUTION_CORRECTED',
        attribution: { before, after: { ...before, completedAt: '2026-10-19T15:00:00.000Z' } },
      }),
    ).toBe('Corrección de quién lo realizó · Fecha 20/10/2026 → 19/10/2026');
  });

  it('la corrección de un realizado «Sin atribuir» lo dice', () => {
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_ATTRIBUTION_CORRECTED',
        attribution: {
          before: { performedById: null, locationId: null, completedAt: null },
          after: { performedById: before.performedById, locationId: null, completedAt: null },
        },
      }),
    ).toBe('Corrección de quién lo realizó · Antes sin atribuir');
  });

  it('quitar «Realizado» dice cuándo se había realizado', () => {
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_DONE_REVERTED',
        attribution: { before, after: { performedById: null, locationId: null, completedAt: null } },
      }),
    ).toBe('Se quitó «Realizado» · realizado el 20/10/2026');
    expect(planItemAttributionDetail({ reason: 'PLAN_ITEM_DONE_REVERTED' })).toBe('Se quitó «Realizado»');
  });

  it('null fuera de la atribución', () => {
    expect(planItemAttributionDetail({ reason: 'PATIENT_FLOW' })).toBeNull();
    expect(planItemAttributionDetail({ changedFields: ['performedById'] })).toBeNull();
  });
});

describe('cancellationDetail (DX-279)', () => {
  it('describe la cancelación con origen, motivo, aviso y si fue tardía', () => {
    expect(
      cancellationDetail({
        reason: 'APPOINTMENT_CANCELLED',
        cancellation: {
          byKind: 'STAFF_FOR_PATIENT',
          reasonCode: 'TRANSPORT',
          noticeMinutes: 300,
          lateCancellation: true,
        },
      }),
    ).toBe('Cita cancelada · el paciente avisó · Transporte · aviso de 300 min · tardía');
  });

  it('nombra el cambio de política y nada en otros eventos', () => {
    expect(cancellationDetail({ reason: 'CANCELLATION_FEE_CHARGED' })).toBe(
      'Cargo por inasistencia o cancelación tardía',
    );
    expect(cancellationDetail({ reason: 'CANCELLATION_FEE_WAIVED' })).toBe('Cargo por inasistencia condonado');
    // SEC-050: la anulación de un cargo ya generado.
    expect(cancellationDetail({ reason: 'CANCELLATION_FEE_VOIDED' })).toBe('Cargo por inasistencia anulado');
    expect(cancellationDetail({ reason: 'CANCELLATION_POLICY_CHANGED' })).toBe(
      'Nueva versión de la política de cancelación',
    );
    expect(cancellationDetail({ reason: 'PATIENT_FLOW' })).toBeNull();
  });
});

describe('healthRegistrationDetail (DX-319)', () => {
  const side = (number: string | null, shown: boolean) => ({ number, shown });

  it('dice el nº y si sale en los documentos, antes y después', () => {
    expect(
      healthRegistrationDetail({
        healthRegistration: { before: side(null, false), after: side('NRS-7', true) },
      }),
    ).toBe('Nº de registro sanitario: sin nº → «NRS-7» · En los documentos: no → sí');
  });

  it('solo lo que cambió', () => {
    expect(
      healthRegistrationDetail({
        healthRegistration: { before: side('NRS-7', true), after: side(null, true) },
      }),
    ).toBe('Nº de registro sanitario: «NRS-7» → sin nº');
    expect(
      healthRegistrationDetail({
        healthRegistration: { before: side('NRS-7', true), after: side('NRS-7', false) },
      }),
    ).toBe('En los documentos: sí → no');
  });

  it('null sin el cambio', () => {
    expect(healthRegistrationDetail({})).toBeNull();
  });
});
