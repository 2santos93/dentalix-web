import {
  exchangeRateBackupDetail,
  cancellationDetail,
  importBatchDetail,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_OPTIONS,
  AUDIT_ACTION_VARIANT,
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
  clinicSettingsDetail,
  locationCalendarDetail,
  staffDetail,
  locationNameMap,
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

describe('clinicSettingsDetail (DX-328)', () => {
  it('clinicSettingsDetail renders Mayoría de edad: 18 → 16 años', () => {
    expect(
      clinicSettingsDetail({
        reason: 'MAJORITY_AGE_SETTINGS',
        statusChange: { from: 'AGE_18', to: 'AGE_16' },
      }),
    ).toBe('Mayoría de edad: 18 → 16 años');
  });

  it('DOCUMENT_TYPE_NAMES_SETTINGS lists the changed types by generic name', () => {
    expect(
      clinicSettingsDetail({
        reason: 'DOCUMENT_TYPE_NAMES_SETTINGS',
        changedFields: ['NATIONAL_ID', 'TAX_ID'],
      }),
    ).toBe('Nombres de documentos: Documento nacional, Identificación fiscal');
  });

  it('an unknown type or empty changedFields → null', () => {
    const reason = 'DOCUMENT_TYPE_NAMES_SETTINGS';
    expect(clinicSettingsDetail({ reason, changedFields: [] })).toBeNull();
    expect(clinicSettingsDetail({ reason })).toBeNull();
    expect(clinicSettingsDetail({ reason, changedFields: ['NATIONAL_ID', 'XYZ'] })).toBeNull();
  });

  it('clinicSettingsDetail renders Receta: cantidad en letras sí → no', () => {
    expect(
      clinicSettingsDetail({
        reason: 'PRESCRIPTION_SETTINGS',
        changedFields: ['printQuantityInWords'],
        statusChange: { from: 'RX_W1_H0_V30', to: 'RX_W0_H0_V30' },
      }),
    ).toBe('Receta: cantidad en letras sí → no');
  });

  it('… nº de historia clínica exigido no → sí; validez 30 → 10 días', () => {
    expect(
      clinicSettingsDetail({
        reason: 'PRESCRIPTION_SETTINGS',
        statusChange: { from: 'RX_W0_H0_V30', to: 'RX_W0_H1_V10' },
      }),
    ).toBe('Receta: nº de historia clínica exigido no → sí; validez 30 → 10 días');
    expect(
      clinicSettingsDetail({
        reason: 'PRESCRIPTION_SETTINGS',
        statusChange: { from: 'RX_W0_H1_V1', to: 'RX_W1_H0_V365' },
      }),
    ).toBe('Receta: cantidad en letras no → sí; nº de historia clínica exigido sí → no; validez 1 → 365 días');
  });

  it.each([
    ['RX_W0_H0_V1', 'RX_W0_H0_V30', 'Receta: validez 1 → 30 días'],
    ['RX_W0_H0_V30', 'RX_W0_H0_V1', 'Receta: validez 30 → 1 día'],
    ['RX_W0_H0_V30', 'RX_W0_H0_V365', 'Receta: validez 30 → 365 días'],
  ])('validity unit agrees with the number next to it (%s → %s)', (from, to, text) => {
    expect(clinicSettingsDetail({ reason: 'PRESCRIPTION_SETTINGS', statusChange: { from, to } })).toBe(text);
  });

  it.each([
    ['RX_W2_H0_V30', 'RX_W0_H0_V30'],
    ['RX_W1_H0_V30', 'RX_W1_H0'],
    ['AGE_18', 'RX_W1_H0_V30'],
    ['rx_w1_h0_v30', 'RX_W0_H0_V30'],
    ['RX_W1_H0_V30', 'RX_W1_H0_V30'],
  ])('a PRESCRIPTION_SETTINGS code that does not match (%s → %s) → null', (from, to) => {
    expect(clinicSettingsDetail({ reason: 'PRESCRIPTION_SETTINGS', statusChange: { from, to } })).toBeNull();
  });

  it.each([
    ['AUTOMATIC', 'MANUAL', 'Tasa de cambio: automática → manual'],
    ['MANUAL', 'AUTOMATIC', 'Tasa de cambio: manual → automática'],
  ])('EXCHANGE_RATE_SOURCE %s → %s (DX-374)', (from, to, text) => {
    expect(clinicSettingsDetail({ reason: 'EXCHANGE_RATE_SOURCE', statusChange: { from, to } })).toBe(text);
  });

  it('EXCHANGE_RATE_SOURCE with an unknown code → null (DX-374)', () => {
    expect(clinicSettingsDetail({ reason: 'EXCHANGE_RATE_SOURCE', statusChange: { from: 'AUTOMATIC', to: 'OTRA' } })).toBeNull();
  });

  it('PRESCRIPTION_SETTINGS without statusChange → null; majority-age codes stay its own', () => {
    expect(clinicSettingsDetail({ reason: 'PRESCRIPTION_SETTINGS' })).toBeNull();
    expect(
      clinicSettingsDetail({ reason: 'MAJORITY_AGE_SETTINGS', statusChange: { from: 'RX_W1_H0_V30', to: 'RX_W0_H0_V30' } }),
    ).toBeNull();
    expect(
      clinicSettingsDetail({ reason: 'MAJORITY_AGE_SETTINGS', statusChange: { from: 'AGE_18', to: 'AGE_21' } }),
    ).toBe('Mayoría de edad: 18 → 21 años');
  });

  it('null para otra reason', () => {
    expect(
      clinicSettingsDetail({ reason: 'CASH_SETTINGS', statusChange: { from: 'AGE_18', to: 'AGE_16' } }),
    ).toBeNull();
    expect(clinicSettingsDetail({})).toBeNull();
  });
});

describe('locationCalendarDetail (DX-316)', () => {
  it('AUDIT_RESOURCE_LABELS.LOCATION_CALENDAR is Calendario de la sede', () => {
    expect(AUDIT_RESOURCE_LABELS.LOCATION_CALENDAR).toBe('Calendario de la sede');
  });

  it.each([
    ['WORKING_WEEKDAYS_CHANGED', 'Días hábiles cambiados'],
    ['HOLIDAY_CREATED', 'Festivo añadido'],
    ['HOLIDAY_UPDATED', 'Festivo editado'],
    ['HOLIDAY_DELETED', 'Festivo eliminado'],
    ['HOLIDAYS_IMPORTED', 'Festivos importados'],
  ])('%s → %s', (reason, label) => {
    expect(locationCalendarDetail({ reason })).toBe(label);
  });

  it('null para otra reason o sin reason', () => {
    expect(locationCalendarDetail({ reason: 'CASH_SETTINGS' })).toBeNull();
    expect(locationCalendarDetail({})).toBeNull();
  });
});

describe('staffDetail (DX-359)', () => {
  it('etiquetas de la acción PASSWORD_CHANGE y de los recursos STAFF_INVITATION y CLINIC', () => {
    expect(AUDIT_ACTION_LABELS.PASSWORD_CHANGE).toBe('Contraseña cambiada');
    expect(AUDIT_ACTION_VARIANT.PASSWORD_CHANGE).toBe('warning');
    expect(AUDIT_ACTION_OPTIONS).toContain('PASSWORD_CHANGE');
    expect(AUDIT_RESOURCE_LABELS.STAFF_INVITATION).toBe('Invitación al personal');
    expect(AUDIT_RESOURCE_LABELS.CLINIC).toBe('Clínica');
    expect(AUDIT_RESOURCE_OPTIONS).toEqual(expect.arrayContaining(['STAFF_INVITATION', 'CLINIC']));
  });

  it.each([
    ['INVITATION_SENT', 'Invitación enviada'],
    ['INVITATION_RESENT', 'Invitación reenviada'],
    ['INVITATION_REVOKED', 'Invitación retirada'],
    ['INVITATION_REPLACED', 'Invitación sustituida por una nueva'],
    ['INVITATION_ACCEPTED', 'Invitación aceptada'],
    ['STAFF_UPDATED', 'Datos del miembro cambiados'],
    ['STAFF_DEACTIVATED', 'Miembro desactivado'],
    ['STAFF_REACTIVATED', 'Miembro reactivado'],
    ['CLINIC_REGISTERED', 'Clínica registrada'],
    ['OWN_NAME_CHANGED', 'Cambió su propio nombre'],
    ['SESSIONS_REVOKED', 'Cambió su contraseña y cerró sus demás sesiones'],
    ['LOCATIONS_CHANGED', 'Sedes del miembro cambiadas'],
  ])('%s → %s', (reason, label) => {
    expect(staffDetail({ reason })).toBe(label);
  });

  it('la invitación dice con qué rol se envía', () => {
    expect(staffDetail({ reason: 'INVITATION_SENT', staffAccess: { after: { role: 'DENTIST' } } })).toBe(
      'Invitación enviada · Rol: Odontólogo/a',
    );
  });

  it('la aceptación y el registro dicen rol y sedes (null = todas)', () => {
    expect(
      staffDetail({
        reason: 'INVITATION_ACCEPTED',
        staffAccess: { after: { role: 'ASSISTANT', locationIds: ['a', 'b'] } },
      }),
    ).toBe('Invitación aceptada · Rol: Asistente · Sedes: 2 sedes');
    expect(
      staffDetail({ reason: 'CLINIC_REGISTERED', staffAccess: { after: { role: 'ADMIN', locationIds: null } } }),
    ).toBe('Clínica registrada · Rol: Administrador/a · Sedes: Todas las sedes');
  });

  it('el cambio de un miembro dice antes → después de lo que cambió', () => {
    expect(
      staffDetail({
        reason: 'STAFF_UPDATED',
        changedFields: ['role', 'locationIds', 'professionalLicense', 'professionalSpecialty'],
        staffAccess: {
          before: { role: 'DENTIST', locationIds: ['a'], professionalLicense: null, professionalSpecialty: 'Ortodoncia' },
          after: { role: 'ADMIN', locationIds: null, professionalLicense: 'RP-7', professionalSpecialty: null },
        },
      }),
    ).toBe(
      'Datos del miembro cambiados · Rol: Odontólogo/a → Administrador/a · Sedes: 1 sede → Todas las sedes · ' +
        'Registro profesional: sin registro → «RP-7» · Especialidad: «Ortodoncia» → sin especialidad',
    );
  });

  it('el nombre solo se nombra, nunca su valor', () => {
    expect(staffDetail({ reason: 'STAFF_UPDATED', changedFields: ['fullName'] })).toBe(
      'Datos del miembro cambiados · Nombre',
    );
    expect(
      staffDetail({
        reason: 'STAFF_UPDATED',
        changedFields: ['fullName', 'role'],
        staffAccess: { before: { role: 'RECEPTION' }, after: { role: 'ASSISTANT' } },
      }),
    ).toBe('Datos del miembro cambiados · Nombre · Rol: Recepción → Asistente');
  });

  it('sin los nombres de las sedes, las cuenta ([] = ninguna)', () => {
    expect(
      staffDetail({
        reason: 'STAFF_UPDATED',
        staffAccess: { before: { locationIds: [] }, after: { locationIds: ['a', 'b', 'c'] } },
      }),
    ).toBe('Datos del miembro cambiados · Sedes: ninguna sede → 3 sedes');
  });

  const CENTRO = '3f1c2a10-0000-4000-8000-000000000001';
  const NORTE = '3f1c2a10-0000-4000-8000-000000000002';
  const BORRADA = '3f1c2a10-0000-4000-8000-0000000000ff';
  const names = locationNameMap([
    { id: NORTE, name: 'Sede Norte' },
    { id: CENTRO.toUpperCase(), name: 'Centro' },
  ]);

  it('con los nombres de las sedes, las dice por su nombre (en orden) y nunca su id', () => {
    const text = staffDetail(
      {
        reason: 'STAFF_UPDATED',
        changedFields: ['locationIds'],
        staffAccess: { before: { locationIds: [NORTE, CENTRO] }, after: { locationIds: null } },
      },
      names,
    );
    expect(text).toBe('Datos del miembro cambiados · Sedes: Centro, Sede Norte → Todas las sedes');
  });

  it('una sede que ya no existe se cuenta aparte, sin su id', () => {
    const one = staffDetail(
      { reason: 'INVITATION_ACCEPTED', staffAccess: { after: { role: 'DENTIST', locationIds: [CENTRO, BORRADA] } } },
      names,
    );
    expect(one).toBe('Invitación aceptada · Rol: Odontólogo/a · Sedes: Centro, 1 sede que ya no existe');
    expect(one).not.toContain(BORRADA);
    expect(
      staffDetail(
        { reason: 'INVITATION_ACCEPTED', staffAccess: { after: { locationIds: [BORRADA, `${BORRADA.slice(0, -1)}e`] } } },
        names,
      ),
    ).toBe('Invitación aceptada · Sedes: 2 sedes que ya no existen');
  });

  it('null y [] se distinguen también con nombres', () => {
    expect(
      staffDetail(
        { reason: 'STAFF_UPDATED', staffAccess: { before: { locationIds: [] }, after: { locationIds: null } } },
        names,
      ),
    ).toBe('Datos del miembro cambiados · Sedes: ninguna sede → Todas las sedes');
  });

  it('con solo el lado de antes dice que es el valor anterior', () => {
    expect(
      staffDetail({ reason: 'STAFF_UPDATED', staffAccess: { before: { role: 'DENTIST', locationIds: [CENTRO] } } }, names),
    ).toBe('Datos del miembro cambiados · Rol: antes Odontólogo/a · Sedes: antes Centro');
  });

  it('un rol desconocido no se pinta en crudo', () => {
    expect(
      staffDetail({
        reason: 'STAFF_UPDATED',
        staffAccess: {
          before: { role: 'DENTIST' },
          after: { role: 'SUPERVISOR' as unknown as 'ADMIN' },
        },
      }),
    ).toBe('Datos del miembro cambiados · Rol: Odontólogo/a → rol no reconocido');
  });

  it('la aceptación que reactiva una membresía lo dice', () => {
    expect(
      staffDetail({
        reason: 'INVITATION_ACCEPTED',
        statusChange: { from: 'INACTIVE', to: 'ACTIVE' },
        staffAccess: { after: { role: 'RECEPTION', locationIds: null } },
      }),
    ).toBe('Invitación aceptada · Miembro reactivado · Rol: Recepción · Sedes: Todas las sedes');
  });

  it('nunca muestra el token, el email ni el nombre aunque llegaran en la metadata', () => {
    const text = staffDetail({
      reason: 'INVITATION_SENT',
      changedFields: ['fullName'],
      params: { token: 'tok-secreto', email: 'ana@example.com' },
      staffAccess: { after: { role: 'ASSISTANT' } },
    } as Parameters<typeof staffDetail>[0]);
    expect(text).toBe('Invitación enviada · Rol: Asistente');
  });

  it('null para otra reason o sin reason', () => {
    expect(staffDetail({ reason: 'LOGIN_UNLOCKED' })).toBeNull();
    expect(staffDetail({})).toBeNull();
  });
});

describe('exchangeRateBackupDetail (DX-402)', () => {
  it('dice que el barrido usó una tasa manual de un día anterior a «manual desde» como respaldo', () => {
    expect(
      exchangeRateBackupDetail({
        reason: 'EXCHANGE_RATE_BACKUP',
        origin: 'JOB',
        exchangeRateBackup: { rateDate: '2026-10-28', manualSince: '2026-10-30', currencies: ['COP', 'USD'] },
      }),
    ).toBe('Tasa de respaldo: la manual de un día anterior a «manual desde» (COP, USD) · proceso automático');
  });

  it('null para otra reason', () => {
    expect(exchangeRateBackupDetail({ reason: 'RECEIPT_ISSUED' })).toBeNull();
    expect(exchangeRateBackupDetail({})).toBeNull();
  });
});
