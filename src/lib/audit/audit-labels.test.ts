import { regionalFormat } from '@/lib/format/regional-format';
import type { AuditEvent } from './audit-api';
import {
  exchangeRateBackupDetail,
  exchangeRateDetail,
  paymentAllocationDetail,
  receiptDetail,
  receiptsSummaryPeriodDetail,
  cancellationDetail,
  externalOrderDetail,
  commissionPaymentDetail,
  dentalLabDetail,
  postOpCheckDetail,
  patientAccessDetail,
  acquisitionDetail,
  importBatchDetail,
  bankReconciliationDetail,
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
  sedationDetail,
  chairDetail,
  recallViaDetail,
  scheduleChangeDetail,
  patientFlowDetail,
  planItemAttributionDetail,
  healthRegistrationDetail,
  clinicSettingsDetail,
  locationCalendarDetail,
  staffDetail,
  locationNameMap,
  signatureRequestDetail,
  confirmationLinkDetail,
  appointmentMoveDetail,
  appointmentSeriesDetail,
  staffNameMap,
  treatmentPlanAcceptanceDetail,
} from './audit-labels';

type AuditMetadata = AuditEvent['metadata'];

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

  it('DX-360: los recursos de configuración de la clínica tienen su etiqueta y salen en el filtro', () => {
    const expected = {
      LOCATION_SCHEDULE: 'Horario de la sede',
      REMINDER_SETTINGS: 'Recordatorios de la sede',
      PRIVACY_POLICY: 'Política de datos',
      APPOINTMENT_TYPE: 'Tipo de cita',
      PAYER: 'Pagador',
      CONSENT_TEMPLATE: 'Plantilla de consentimiento',
      PRESCRIPTION_TEMPLATE: 'Plantilla de receta',
      INVENTORY_ITEM: 'Artículo de inventario',
      INVENTORY_MOVEMENT: 'Movimiento de inventario',
    } as const;
    for (const [resource, label] of Object.entries(expected)) {
      expect(AUDIT_RESOURCE_LABELS[resource as keyof typeof expected]).toBe(label);
      expect(AUDIT_RESOURCE_OPTIONS).toContain(resource);
    }
  });

  it('DX-015-bis: los tipos de recall tienen su etiqueta y salen en el filtro', () => {
    expect(AUDIT_RESOURCE_LABELS.RECALL_TYPE).toBe('Tipo de recall');
    expect(AUDIT_RESOURCE_OPTIONS).toContain('RECALL_TYPE');
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

describe('commissionPaymentDetail (DX-464)', () => {
  it('nombra el pago, su anulación, los PDF y la conformidad; el resto no es suyo', () => {
    expect(commissionPaymentDetail({ reason: 'COMMISSION_PAYMENT_CREATED' })).toBe('Pago de la liquidación registrado');
    expect(commissionPaymentDetail({ reason: 'COMMISSION_PAYMENT_VOIDED' })).toBe('Pago de la liquidación anulado');
    expect(commissionPaymentDetail({ reason: 'COMMISSION_RECEIPT_SIGNED' })).toBe('Conformidad firmada por el profesional');
    expect(commissionPaymentDetail({ reason: 'COMMISSION_PAYMENT' })).toBe('Gasto del pago de honorarios');
    expect(commissionPaymentDetail({ reason: 'EXTERNAL_ORDER_ISSUED' })).toBeNull();
  });
});

describe('externalOrderDetail (DX-572)', () => {
  it('nombra cada paso de la orden y de su plantilla; el recurso tiene etiqueta', () => {
    expect(AUDIT_RESOURCE_LABELS.EXTERNAL_ORDER).toBe('Orden externa');
    expect(AUDIT_RESOURCE_LABELS.EXTERNAL_ORDER_TEMPLATE).toBe('Plantilla de orden externa');
    expect(externalOrderDetail({ reason: 'EXTERNAL_ORDER_ISSUED' })).toBe('Orden emitida');
    expect(externalOrderDetail({ reason: 'EXTERNAL_ORDER_RESULT_LINKED' })).toBe('Resultado ligado a la orden');
    expect(externalOrderDetail({ reason: 'EXTERNAL_ORDER_RESULT_UNLINKED' })).toBe('Resultado desligado de la orden');
    expect(externalOrderDetail({ reason: 'EXTERNAL_ORDER_COPY_DOWNLOADED' })).toBe(
      'Orden descargada por el paciente con el enlace',
    );
    expect(externalOrderDetail({ reason: 'EXTERNAL_ORDER_TEMPLATE_UPDATED' })).toBe('Plantilla de orden cambiada');
    expect(externalOrderDetail({ reason: 'CHAIR_ORDER' })).toBeNull();
  });

  it('el paciente abre y descarga con su enlace (sin usuario); el plazo es un ajuste de la clínica', () => {
    expect(isPatientOptOut({ reason: 'EXTERNAL_ORDER_COPY_OPENED' })).toBe(true);
    expect(isPatientOptOut({ reason: 'EXTERNAL_ORDER_COPY_DOWNLOADED' })).toBe(true);
    expect(isPatientOptOut({ reason: 'EXTERNAL_ORDER_COPY_SENT' })).toBe(false);
    expect(clinicSettingsDetail({ reason: 'EXTERNAL_ORDER_SETTINGS', changedFields: ['overdueDays'] })).toBe(
      'Plazo de las órdenes externas sin resultado',
    );
  });
});

describe('resumen semanal (DX-568)', () => {
  it('nombra el cambio de ajustes, la prueba y la baja desde el enlace', () => {
    expect(
      clinicSettingsDetail({ reason: 'WEEKLY_DIGEST_SETTINGS', changedFields: ['enabled', 'recipientMembershipIds'] }),
    ).toBe('Resumen semanal por email');
    expect(clinicSettingsDetail({ reason: 'WEEKLY_DIGEST_TEST_SENT' })).toBe(
      'Prueba del resumen semanal enviada a su correo',
    );
    expect(
      clinicSettingsDetail({ reason: 'WEEKLY_DIGEST_UNSUBSCRIBED', changedFields: ['recipientMembershipIds'] }),
    ).toBe('Dejó de recibir el resumen semanal desde el enlace del email');
  });
});

describe('chairDetail (DX-211)', () => {
  it('nombra el orden, la desactivación y la reactivación de un sillón', () => {
    expect(chairDetail({ reason: 'CHAIR_ORDER' })).toBe('Orden de los sillones');
    expect(chairDetail({ reason: 'CHAIR_DEACTIVATED' })).toBe('Sillón desactivado');
    expect(chairDetail({ reason: 'CHAIR_REACTIVATED' })).toBe('Sillón reactivado');
    expect(chairDetail({ reason: 'EQUIPMENT_RETIRED' })).toBe('Equipo dado de baja');
    expect(chairDetail({ reason: 'SEDATION_VITALS' })).toBeNull();
  });
});

describe('sedationDetail (DX-407)', () => {
  it('nombra la parte de la hoja de sedación y nada más', () => {
    expect(sedationDetail({ reason: 'SEDATION_VITALS' })).toBe('Toma de constantes');
    expect(sedationDetail({ reason: 'SEDATION_DISCHARGE' })).toBe('Egreso');
    expect(sedationDetail({ reason: 'CASH_SESSION_CLOSED' })).toBeNull();
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

const H23 = regionalFormat({ locale: 'es', hourCycle: 'h23' });
const H12 = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
const WEEKLY: AuditMetadata = {
  scheduleChange: {
    before: [],
    after: [
      { locationId: 'a', weekday: 1, startMinute: 480, endMinute: 780 },
      { locationId: 'b', weekday: 4, startMinute: 840, endMinute: 1140 },
    ],
  },
};

describe('scheduleChangeDetail (DX-233)', () => {
  it('semanal: antes y después por día', () => {
    expect(
      scheduleChangeDetail(WEEKLY, H23),
    ).toBe('Antes: sin horario · Después: lun 08:00–13:00, jue 14:00–19:00');
  });
  it('DX-354: cambio de horario en 12 h con una sede h12', () => {
    expect(scheduleChangeDetail(WEEKLY, H12)).toBe(
      'Antes: sin horario · Después: lun 8:00 a. m.–1:00 p. m., jue 2:00 p. m.–7:00 p. m.',
    );
  });
  it('DX-354: con fmt null «—», no otro reloj', () => {
    expect(scheduleChangeDetail(WEEKLY, null)).toBe('Antes: sin horario · Después: —');
  });
  it('excepción: fecha y «no trabaja»', () => {
    expect(
      scheduleChangeDetail({
        scheduleChange: {
          before: [{ locationId: 'b', date: '2026-10-22', startMinute: 840, endMinute: 1140 }],
          after: [{ locationId: 'b', date: '2026-10-22', off: true }],
        },
      }, H23),
    ).toBe('Antes: 22 de octubre 14:00–19:00 · Después: 22 de octubre no trabaja');
  });
  it('sin cambio de horario, null', () => {
    expect(scheduleChangeDetail({}, H23)).toBeNull();
  });
});

describe('bankReconciliationDetail (DX-571)', () => {
  const sha = 'abcdef0123456789'.repeat(4);

  it('nombra los tres recursos', () => {
    expect(AUDIT_RESOURCE_LABELS.BANK_ACCOUNT).toBe('Cuenta de conciliación');
    expect(AUDIT_RESOURCE_LABELS.BANK_STATEMENT_IMPORT).toBe('Extracto del banco');
    expect(AUDIT_RESOURCE_LABELS.BANK_RECONCILIATION_MATCH).toBe('Emparejado con el banco');
  });

  it('el extracto importado dice sus totales, los conciliados solos y el inicio del hash', () => {
    expect(
      bankReconciliationDetail('BANK_STATEMENT_IMPORT', {
        reason: 'IMPORT_CONFIRMED',
        importBatch: { fileSha256: sha, rows: 12, valid: 9, duplicates: 2, errors: 1, created: 7, matched: 5 } as never,
      }),
    ).toBe(
      'Extracto importado · 12 filas · 7 nuevos · 2 ya importados · 1 con error · 5 conciliados solos · SHA-256 abcdef012345…',
    );
  });

  it('cada acción de la conciliación con su texto; lo ajeno no es suyo', () => {
    expect(bankReconciliationDetail('BANK_RECONCILIATION_MATCH', { reason: 'MANUAL_MATCH' })).toBe('Emparejado a mano');
    expect(bankReconciliationDetail('BANK_RECONCILIATION_MATCH', { reason: 'MANUAL_UNMATCH' })).toBe('Emparejado deshecho');
    expect(bankReconciliationDetail('BANK_ACCOUNT', { reason: 'AUTO_MATCH' })).toBe('Volver a emparejar');
    expect(bankReconciliationDetail('BANK_ACCOUNT', { reason: 'RECONCILIATION_SUMMARY' })).toBe('Resumen de la conciliación');
    expect(bankReconciliationDetail('BANK_ACCOUNT', { reason: 'RECONCILIATION_ITEMS' })).toBe('Lista de la conciliación');
    expect(bankReconciliationDetail('BANK_ACCOUNT', { reason: 'RECONCILIATION_CANDIDATES' })).toBe(
      'Abonos candidatos de un movimiento',
    );
    // La importación de pacientes sigue con su propio texto.
    expect(
      bankReconciliationDetail('PATIENT_IMPORT_BATCH', { reason: 'IMPORT_CONFIRMED', importBatch: { fileSha256: sha } }),
    ).toBeNull();
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

/** El reloj de la pantalla de auditoría de una sede en UTC con locale `es`. */
const CLOCK = { timeZone: 'UTC', fmt: H23 };

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
      }, CLOCK),
    ).toBe('Corrección de quién lo realizó · Otro profesional');
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_ATTRIBUTION_CORRECTED',
        attribution: { before, after: { ...before, completedAt: '2026-10-19T15:00:00.000Z' } },
      }, CLOCK),
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
      }, CLOCK),
    ).toBe('Corrección de quién lo realizó · Antes sin atribuir');
  });

  it('quitar «Realizado» dice cuándo se había realizado', () => {
    expect(
      planItemAttributionDetail({
        reason: 'PLAN_ITEM_DONE_REVERTED',
        attribution: { before, after: { performedById: null, locationId: null, completedAt: null } },
      }, CLOCK),
    ).toBe('Se quitó «Realizado» · realizado el 20/10/2026');
    expect(planItemAttributionDetail({ reason: 'PLAN_ITEM_DONE_REVERTED' }, CLOCK)).toBe('Se quitó «Realizado»');
  });

  it('DX-354: las fechas con la zona y el formato de la sede de la pantalla; sin él, «—»', () => {
    const reverted: AuditMetadata = {
      reason: 'PLAN_ITEM_DONE_REVERTED',
      attribution: { before, after: { performedById: null, locationId: null, completedAt: null } },
    };
    // 15:00 UTC del 20/10 es el 20/10 en Nueva York, en el orden de en-US.
    expect(planItemAttributionDetail(reverted, { timeZone: 'America/New_York', fmt: H12 })).toBe(
      'Se quitó «Realizado» · realizado el 10/20/2026',
    );
    expect(planItemAttributionDetail(reverted, null)).toBe('Se quitó «Realizado» · realizado el —');
  });

  it('null fuera de la atribución', () => {
    expect(planItemAttributionDetail({ reason: 'PATIENT_FLOW' }, CLOCK)).toBeNull();
    expect(planItemAttributionDetail({ changedFields: ['performedById'] }, CLOCK)).toBeNull();
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
  it('DX-561: el seguimiento automático de presupuestos (ajustes, pausa, reanudación y aviso)', () => {
    expect(clinicSettingsDetail({ reason: 'QUOTE_FOLLOW_UP_SETTINGS_UPDATED', changedFields: ['enabled'] })).toBe(
      'Seguimiento automático de presupuestos',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'QUOTE_FOLLOW_UP_PAUSED' })).toBe(
      'Seguimiento automático del presupuesto pausado',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'QUOTE_FOLLOW_UP_RESUMED' })).toBe(
      'Seguimiento automático del presupuesto reanudado',
    );
    expect(signatureRequestDetail({ reason: 'QUOTE_FOLLOW_UP_SENT', origin: 'JOB' })).toBe(
      'Aviso de seguimiento del presupuesto enviado con un enlace para aceptarlo',
    );
  });

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

  it.each([
    ['OFF', 'ON', 'Aviso de registro profesional en las evoluciones: activado'],
    ['ON', 'OFF', 'Aviso de registro profesional en las evoluciones: desactivado'],
  ])('DX-540: CLINICAL_ENTRY_LICENSE_WARNING %s → %s', (from, to, text) => {
    expect(clinicSettingsDetail({ reason: 'CLINICAL_ENTRY_LICENSE_WARNING', statusChange: { from, to } })).toBe(text);
  });

  it('DX-540: CLINICAL_ENTRY_LICENSE_WARNING with unknown codes → null', () => {
    expect(clinicSettingsDetail({ reason: 'CLINICAL_ENTRY_LICENSE_WARNING', statusChange: { from: 'ON', to: 'ON' } })).toBeNull();
    expect(clinicSettingsDetail({ reason: 'CLINICAL_ENTRY_LICENSE_WARNING' })).toBeNull();
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

  it('DX-379: QUOTE_SETTINGS → «Validez del presupuesto: 30 días → 45 días» (y «1 día»); un código raro → null', () => {
    expect(
      clinicSettingsDetail({ reason: 'QUOTE_SETTINGS', statusChange: { from: 'QT_V30', to: 'QT_V45' } }),
    ).toBe('Validez del presupuesto: 30 días → 45 días');
    expect(
      clinicSettingsDetail({ reason: 'QUOTE_SETTINGS', statusChange: { from: 'QT_V30', to: 'QT_V1' } }),
    ).toBe('Validez del presupuesto: 30 días → 1 día');
    expect(clinicSettingsDetail({ reason: 'QUOTE_SETTINGS', statusChange: { from: 'AGE_18', to: 'QT_V45' } })).toBeNull();
    expect(clinicSettingsDetail({ reason: 'QUOTE_SETTINGS' })).toBeNull();
  });

  describe('CLINICAL_RECORD_RETENTION_SETTINGS (DX-330)', () => {
    const event = (direction: 'UP' | 'DOWN', n: number, win = false) => ({
      reason: 'CLINICAL_RECORD_RETENTION_SETTINGS',
      configChange: { before: { clinicalRecordRetentionYears: 25 }, after: { clinicalRecordRetentionYears: 15 } },
      retentionTermChange: {
        direction,
        protectedPatients: n,
        effectiveBefore: 25,
        effectiveAfter: 15,
        withinCorrectionWindow: win,
      },
    });
    it.each([
      [0, 'Conservación de la historia clínica'],
      [1, 'Conservación de la historia clínica · 1 historia mantiene su fecha'],
      [2, 'Conservación de la historia clínica · 2 historias mantienen su fecha'],
    ])('bajada con n = %i', (n, text) => {
      expect(clinicSettingsDetail(event('DOWN', n))).toBe(text);
    });
    it('bajada dentro de la ventana de corrección', () => {
      expect(clinicSettingsDetail(event('DOWN', 2, true))).toBe(
        'Conservación de la historia clínica · 2 historias mantienen su fecha · corrección de una subida',
      );
      expect(clinicSettingsDetail(event('DOWN', 0, true))).toBe(
        'Conservación de la historia clínica · corrección de una subida',
      );
    });
    it('subida y metadata rota → null', () => {
      expect(clinicSettingsDetail(event('UP', 0))).toBeNull();
      expect(clinicSettingsDetail({ reason: 'CLINICAL_RECORD_RETENTION_SETTINGS' })).toBeNull();
      expect(clinicSettingsDetail(event('DOWN', -1))).toBeNull();
    });
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
    ['PERMISSIONS_CHANGED', 'Permisos extra del miembro cambiados'],
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
        exchangeRateBackup: { rateDate: '2026-10-28', manualSince: '2026-10-30', currencies: ['VES', 'USD'] },
      }),
    ).toBe('Tasa de respaldo: la manual de un día anterior a «manual desde» (VES, USD) · proceso automático');
  });

  it('null para otra reason', () => {
    expect(exchangeRateBackupDetail({ reason: 'RECEIPT_ISSUED' })).toBeNull();
    expect(exchangeRateBackupDetail({})).toBeNull();
  });

  it('DX-361: el enlace de confirmación de la cita, generado o reenviado por el personal', () => {
    expect(confirmationLinkDetail({ reason: 'CONFIRMATION_LINK_CREATED', origin: 'STAFF' })).toBe(
      'Enlace de confirmación generado · por el personal',
    );
    expect(confirmationLinkDetail({ reason: 'CONFIRMATION_LINK_RESENT', origin: 'STAFF' })).toBe(
      'Enlace de confirmación reenviado · por el personal',
    );
    expect(isPatientOptOut({ reason: 'CONFIRMATION_LINK_CREATED', origin: 'STAFF' })).toBe(false);
  });

  it('DX-361: la respuesta del paciente desde el enlace sale sin usuario, con el estado y el aviso al cancelar', () => {
    expect(
      confirmationLinkDetail({
        reason: 'CONFIRMATION_LINK_CONFIRMED',
        origin: 'LINK',
        status: { from: 'SCHEDULED', to: 'CONFIRMED' },
      }),
    ).toBe('Cita confirmada · desde el enlace del paciente · Agendada → Confirmada');
    expect(
      confirmationLinkDetail({
        reason: 'CONFIRMATION_LINK_CANCELLED',
        origin: 'LINK',
        status: { from: 'CONFIRMED', to: 'CANCELLED' },
        cancellation: { byKind: 'PATIENT_LINK', reasonCode: null, noticeMinutes: 90, lateCancellation: true },
      }),
    ).toBe('Cita cancelada · desde el enlace del paciente · Confirmada → Cancelada · aviso de 90 min · tardía');
    expect(confirmationLinkDetail({ reason: 'CONFIRMATION_LINK_CALL_REQUESTED', origin: 'LINK' })).toBe(
      'Pidió que lo llamen · desde el enlace del paciente',
    );
    for (const reason of [
      'CONFIRMATION_LINK_CONFIRMED',
      'CONFIRMATION_LINK_CANCELLED',
      'CONFIRMATION_LINK_CALL_REQUESTED',
    ]) {
      expect(isPatientOptOut({ reason, origin: 'LINK' })).toBe(true);
    }
    expect(confirmationLinkDetail({ reason: 'APPOINTMENT_CANCELLED' })).toBeNull();
    expect(confirmationLinkDetail({})).toBeNull();
  });

  it('DX-243: los pasos de la firma a distancia, y los del paciente salen sin usuario', () => {
    expect(AUDIT_RESOURCE_LABELS.SIGNATURE_REQUEST).toBe('Firma a distancia');
    expect(signatureRequestDetail({ reason: 'SIGNATURE_LINK_LOCKED', origin: 'LINK' })).toBe(
      'Enlace bloqueado tras 5 códigos incorrectos',
    );
    expect(signatureRequestDetail({ reason: 'CONSENT_COUNTERSIGNED' })).toBe(
      'Firma del profesional (consentimiento completo)',
    );
    expect(signatureRequestDetail({ reason: 'OTRA_COSA' })).toBeNull();
    expect(isPatientOptOut({ reason: 'SIGNATURE_PATIENT_SIGNED', origin: 'LINK' })).toBe(true);
    expect(isPatientOptOut({ reason: 'SIGNATURE_REQUEST_SENT' })).toBe(false);
  });
});

describe('recibo no fiscal en la auditoría (DX-515)', () => {
  it.each([
    ['RECEIPT_SETTINGS', 'Título y leyenda del recibo'],
    ['RECEIPT_LEGEND', 'Leyenda del recibo de la sede'],
    ['EXTERNAL_INVOICE_NUMBER', 'Nº de factura externa del abono'],
    ['CURRENCY_TEXTS', 'Texto de las monedas'],
    ['CLINIC_PROFILE', 'Datos de la clínica'],
    ['CLINIC_LOGO', 'Logo de la clínica'],
  ])('%s → %s', (reason, text) => {
    expect(receiptDetail({ reason })).toBe(text);
  });
});

describe('exchangeRateDetail (DX-381)', () => {
  const VES = { currency: 'VES', day: '2026-10-29', rate: '36.5' };
  const ES_VE = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });

  it('moneda · día · tasa con el formato de la sede', () => {
    expect(exchangeRateDetail({ exchangeRate: VES }, H23)).toBe('VES · 29/10/2026 · 36,5');
    expect(exchangeRateDetail({ exchangeRate: VES }, ES_VE)).toBe('VES · 29/10/2026 · 36,5');
    expect(exchangeRateDetail({ exchangeRate: VES }, H12)).toBe('VES · 10/29/2026 · 36.5');
  });

  it('los decimales de la tasa se conservan hasta 8, sin ceros de más', () => {
    expect(exchangeRateDetail({ exchangeRate: { ...VES, rate: '40.12345678' } }, H23)).toBe(
      'VES · 29/10/2026 · 40,12345678',
    );
    expect(exchangeRateDetail({ exchangeRate: { ...VES, rate: '0.91' } }, H23)).toBe('VES · 29/10/2026 · 0,91');
  });

  it('sin el formato de la sede no inventa otro: «—»', () => {
    expect(exchangeRateDetail({ exchangeRate: VES }, null)).toBe('VES · — · —');
  });

  it('null si el evento no trae tasa', () => {
    expect(exchangeRateDetail({}, H23)).toBeNull();
    expect(exchangeRateDetail({ reason: 'EXCHANGE_RATE_BACKUP' }, H23)).toBeNull();
  });
});

describe('staffDetail › cambio de sedes del miembro (DX-381)', () => {
  const CENTRO = '3f1c2a10-0000-4000-8000-000000000001';
  const NORTE = '3f1c2a10-0000-4000-8000-000000000002';
  const names = locationNameMap([
    { id: CENTRO, name: 'Sede Centro' },
    { id: NORTE, name: 'Sede Norte' },
  ]);
  const change = (before: string[] | null, after: string[] | null): AuditMetadata => ({
    reason: 'LOCATIONS_CHANGED',
    staffAccess: { before: { locationIds: before }, after: { locationIds: after } },
  });

  it('antes → después por nombre de sede', () => {
    expect(staffDetail(change([CENTRO], [CENTRO, NORTE]), names)).toBe(
      'Sedes del miembro cambiadas · Sedes: Sede Centro → Sede Centro, Sede Norte',
    );
  });

  it('null = «Todas las sedes» en cualquiera de los lados', () => {
    expect(staffDetail(change(null, [NORTE]), names)).toBe(
      'Sedes del miembro cambiadas · Sedes: Todas las sedes → Sede Norte',
    );
    expect(staffDetail(change([CENTRO], null), names)).toBe(
      'Sedes del miembro cambiadas · Sedes: Sede Centro → Todas las sedes',
    );
  });

  it('un evento anterior, sin antes ni después, sigue diciendo solo el motivo', () => {
    expect(staffDetail({ reason: 'LOCATIONS_CHANGED' }, names)).toBe('Sedes del miembro cambiadas');
  });
});

describe('staffDetail de PERMISSIONS_CHANGED (DX-090)', () => {
  it('antes → después con el nombre de cada permiso', () => {
    expect(
      staffDetail({
        reason: 'PERMISSIONS_CHANGED',
        staffAccess: {
          before: { extraPermissions: [] },
          after: { extraPermissions: ['PAYMENT_REGISTER', 'FINANCIAL_REPORTS_VIEW'] },
        },
      }),
    ).toBe(
      'Permisos extra del miembro cambiados · Permisos extra: ninguno → registrar abonos y operar su caja, ver reportes financieros y la caja',
    );
  });
});

describe('paymentAllocationDetail (DX-399)', () => {
  // Intl separa el código del importe con un espacio duro.
  const detail = (...args: Parameters<typeof paymentAllocationDetail>) =>
    paymentAllocationDetail(...args)?.replace(/\u00a0/g, ' ');
  const ES_VE = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
  const ITEM_A = '11111111-1111-4111-8111-111111111111';
  const ITEM_B = '22222222-2222-4222-8222-222222222222';
  const manual = {
    reason: 'PAYMENT_REALLOCATED',
    allocation: {
      currency: 'EUR',
      mode: 'MANUAL' as const,
      before: [{ itemId: ITEM_A, amount: 100 }],
      after: [{ itemId: ITEM_B, amount: 25.5 }],
    },
  };

  it('fijada a mano: la regla y el antes y el después con el importe en la moneda del plan', () => {
    expect(detail(manual, ES_VE)).toBe(
      'Imputación fijada a mano · antes: 1 ítem · EUR 100,00 → después: 1 ítem · EUR 25,50',
    );
  });

  it('devuelta al reparto automático, con varios ítems y un lado sin imputar', () => {
    expect(
      detail(
        {
          reason: 'PAYMENT_REALLOCATED',
          allocation: {
            currency: 'USD',
            mode: 'AUTO',
            before: [],
            after: [
              { itemId: ITEM_A, amount: 10.1 },
              { itemId: ITEM_B, amount: 20.2 },
            ],
          },
        },
        ES_VE,
      ),
    ).toBe('Imputación devuelta al reparto automático · antes: sin imputar → después: 2 ítems · USD 30,30');
    expect(
      detail(
        {
          reason: 'PAYMENT_REALLOCATED',
          allocation: { currency: 'EUR', mode: 'AUTO', before: [{ itemId: ITEM_A, amount: 25.5 }], after: [] },
        },
        ES_VE,
      ),
    ).toBe('Imputación devuelta al reparto automático · antes: 1 ítem · EUR 25,50 → después: lo reparte el sistema');

  });

  it('sin el formato de la sede no inventa otro: «—»', () => {
    expect(paymentAllocationDetail(manual, null)).toBe(
      'Imputación fijada a mano · antes: 1 ítem · — → después: 1 ítem · —',
    );
  });

  it('null si el evento no es de una reimputación', () => {
    expect(paymentAllocationDetail({}, ES_VE)).toBeNull();
    expect(paymentAllocationDetail({ reason: 'PAYMENT_REALLOCATED' }, ES_VE)).toBeNull();
    expect(paymentAllocationDetail({ allocation: manual.allocation }, ES_VE)).toBeNull();
  });
});

describe('appointmentMoveDetail (DX-133-bis)', () => {
  const ANA = 'AAAAAAAA-1111-4111-8111-111111111111';
  const LUIS = '22222222-2222-4222-8222-222222222222';
  const VE = { timeZone: 'America/Caracas', fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }) };
  const staff = staffNameMap([
    { userId: ANA, fullName: 'Ana Pérez' },
    { userId: LUIS, fullName: 'Luis Gómez' },
  ]);
  // 13:00 y 14:00 en Caracas (UTC−4).
  const move = {
    from: { start: '2026-11-10T17:00:00.000Z', end: '2026-11-10T17:30:00.000Z', providerId: ANA.toLowerCase() },
    to: { start: '2026-11-10T18:00:00.000Z', end: '2026-11-10T18:30:00.000Z', providerId: LUIS },
  };

  it('pinta la hora con el reloj de la sede y el profesional antes y después', () => {
    const detail = appointmentMoveDetail({ reason: 'APPOINTMENT_MOVED', move }, VE, staff);
    expect(detail).toBe(
      `Cita movida · Antes: ${VE.fmt.dateTime(new Date(move.from.start), VE.timeZone)}, Ana Pérez · Después: ${VE.fmt.dateTime(new Date(move.to.start), VE.timeZone)}, Luis Gómez`,
    );
    expect(detail).toMatch(/1:00/);
    expect(detail).toMatch(/2:00/);
  });

  it('DX-436-bis: «Asignar» desde «Ocupar este hueco» se nombra como tal', () => {
    const detail = appointmentMoveDetail(
      { reason: 'APPOINTMENT_MOVED', move: { ...move, via: 'OPENING' as const } },
      VE,
      staff,
    );
    expect(detail).toMatch(/^Cita movida a un hueco liberado · Antes: /);
  });

  it('un profesional que ya no está se nombra como retirado, nunca por su id', () => {
    const detail = appointmentMoveDetail(
      { reason: 'APPOINTMENT_MOVED', move: { ...move, to: { ...move.to, providerId: '99999999-9999-4999-8999-999999999999' } } },
      VE,
      staff,
    );
    expect(detail).toContain('profesional retirado');
    expect(detail).not.toContain('9999');
  });

  it('sin la lista del personal no nombra a nadie: solo si cambió de profesional', () => {
    expect(appointmentMoveDetail({ reason: 'APPOINTMENT_MOVED', move }, VE, null)).toBe(
      `Cita movida · ${VE.fmt.dateTime(new Date(move.from.start), VE.timeZone)} → ${VE.fmt.dateTime(new Date(move.to.start), VE.timeZone)} · otro profesional`,
    );
    expect(
      appointmentMoveDetail({ reason: 'APPOINTMENT_MOVED', move: { ...move, to: { ...move.to, providerId: ANA } } }, VE, null),
    ).not.toContain('otro profesional');
  });

  it('sin el reloj de la sede, «—» en vez de otra hora; null si no es un movimiento', () => {
    expect(appointmentMoveDetail({ reason: 'APPOINTMENT_MOVED', move }, null, staff)).toBe(
      'Cita movida · Antes: —, Ana Pérez · Después: —, Luis Gómez',
    );
    expect(appointmentMoveDetail({ reason: 'APPOINTMENT_MOVED' }, VE, staff)).toBe('Cita movida');
    expect(appointmentMoveDetail({ reason: 'PATIENT_FLOW' }, VE, staff)).toBeNull();
  });
});

describe('treatmentPlanAcceptanceDetail (DX-379 C)', () => {
  it('nombra cómo se aceptó un presupuesto vencido y la vista previa de la firma', () => {
    expect(treatmentPlanAcceptanceDetail({ reason: 'QUOTE_EXPIRED_ORIGINAL_PRICES' })).toBe(
      'Presupuesto vencido aceptado con los precios originales',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'QUOTE_EXPIRED_REPRICED' })).toBe(
      'Presupuesto vencido aceptado con los precios actualizados',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'ACCEPT_REPRICE_PREVIEW' })).toBe(
      'Vista previa de los precios actualizados para aceptar',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'CHAIR_ORDER' })).toBeNull();
    expect(treatmentPlanAcceptanceDetail({})).toBeNull();
  });

  it('DX-417: nombra la aceptación parcial, su vista previa y el alta del presupuesto pendiente', () => {
    expect(treatmentPlanAcceptanceDetail({ reason: 'PLAN_PARTIALLY_ACCEPTED' })).toBe('Presupuesto aceptado en parte');
    expect(treatmentPlanAcceptanceDetail({ reason: 'ACCEPT_PARTIAL_PREVIEW' })).toBe(
      'Vista previa de la aceptación parcial',
    );
    expect(treatmentPlanAcceptanceDetail({ reason: 'PLAN_SPLIT_PENDING' })).toBe(
      'Presupuesto pendiente creado por una aceptación parcial',
    );
    expect(treatmentPlanAcceptanceDetail({})).toBeNull();
  });
});

describe('receiptsSummaryPeriodDetail (DX-401)', () => {
  const H23 = regionalFormat({ locale: 'es-VE', hourCycle: 'h23' });
  const period = { from: '2026-11-01', to: '2026-11-30' };

  it('el periodo del resumen con el formato de la sede', () => {
    expect(receiptsSummaryPeriodDetail({ period }, H23)).toBe('Periodo 01/11/2026 – 30/11/2026');
    expect(AUDIT_RESOURCE_LABELS.PAYMENT_RECEIPT_SUMMARY).toBe('Resumen de recibos');
  });

  it('sin el formato de la sede, «—»; sin periodo, null', () => {
    expect(receiptsSummaryPeriodDetail({ period }, null)).toBe('Periodo — – —');
    expect(receiptsSummaryPeriodDetail({}, H23)).toBeNull();
  });
});

describe('recallViaDetail (DX-015-bis)', () => {
  it('rotula por dónde se programó el recall', () => {
    expect(recallViaDetail({ via: 'DEFAULT' })).toBe('Recall por defecto');
    expect(recallViaDetail({ via: 'CLINICAL_ENTRY' })).toBe('Desde la evolución');
  });
  it('sin `via` o con uno desconocido, nada', () => {
    expect(recallViaDetail({})).toBeNull();
    expect(recallViaDetail({ via: 'OTRO' as never })).toBeNull();
  });
});

describe('dentalLabDetail (DX-017)', () => {
  it('nombra cada paso de la orden de laboratorio y del laboratorio, sin texto clínico', () => {
    expect(dentalLabDetail({ reason: 'DENTAL_LAB_ORDER_SENT' })).toBe('Orden de laboratorio enviada');
    expect(dentalLabDetail({ reason: 'DENTAL_LAB_ORDER_RECEIVED' })).toBe('Orden de laboratorio recibida');
    expect(dentalLabDetail({ reason: 'DENTAL_LAB_ORDER_CANCELLED' })).toBe('Orden de laboratorio anulada');
    expect(dentalLabDetail({ reason: 'DENTAL_LAB_SERVICE_CREATED' })).toBe('Servicio del laboratorio creado');
    expect(dentalLabDetail({ reason: 'EXTERNAL_ORDER_ISSUED' })).toBeNull();
    expect(dentalLabDetail({})).toBeNull();
  });
});

describe('postOpCheckDetail (DX-566)', () => {
  it('nombra el recurso y cada paso del control postoperatorio', () => {
    expect(AUDIT_RESOURCE_LABELS.POST_OP_CHECK).toBe('Control postoperatorio');
    expect(postOpCheckDetail({ reason: 'POST_OP_CHECK_LIST' })).toBe('Controles postoperatorios de la sede consultados');
    expect(postOpCheckDetail({ reason: 'POST_OP_CHECK_NO_ANSWER' })).toBe('Control postoperatorio: no contesta');
    expect(postOpCheckDetail({ reason: 'POST_OP_CHECK_ITEM_DELETED' })).toBe(
      'Control postoperatorio anulado: se borró el ítem del plan',
    );
    expect(postOpCheckDetail({ reason: 'CHAIR_ORDER' })).toBeNull();
    expect(postOpCheckDetail({})).toBeNull();
  });
});

describe('patientAccessDetail (DX-101)', () => {
  it('nombra cada paso del enlace de acceso del paciente', () => {
    expect(AUDIT_RESOURCE_LABELS.PATIENT_ACCESS_LINK).toBe('Enlace de acceso del paciente');
    expect(patientAccessDetail({ reason: 'PATIENT_ACCESS_LINK_CREATED' })).toBe('Enlace de acceso del paciente creado');
    expect(patientAccessDetail({ reason: 'PATIENT_ACCESS_LINK_REVOKED' })).toBe('Enlace de acceso del paciente revocado');
    expect(patientAccessDetail({ reason: 'PATIENT_ACCESS_VERIFIED' })).toBe('El paciente abrió su enlace de acceso');
    expect(patientAccessDetail({ reason: 'PATIENT_ACCESS_LOCKED' })).toBe(
      'Enlace de acceso bloqueado 30 min por intentos fallidos',
    );
    expect(patientAccessDetail({ reason: 'POST_OP_CHECK_LIST' })).toBeNull();
    expect(patientAccessDetail({})).toBeNull();
  });
});

describe('acquisitionDetail (DX-172)', () => {
  it('nombra cada paso de la captación y del catálogo; null para lo demás', () => {
    expect(acquisitionDetail({ reason: 'PATIENT_ACQUISITION_CHANGED' })).toBe('«¿Cómo nos conoció?» cambiado');
    expect(acquisitionDetail({ reason: 'PATIENT_ACQUISITION' })).toBe(
      'Consulta de «¿Cómo nos conoció?» y de sus recomendados',
    );
    expect(acquisitionDetail({ reason: 'ACQUISITION_REPORT' })).toBe('Informe de captación de pacientes');
    expect(acquisitionDetail({ reason: 'PATIENT_SOURCE_CREATED' })).toBe('Origen de pacientes: fuente añadida');
    expect(acquisitionDetail({ reason: 'PATIENT_SOURCE_UPDATED' })).toBe('Origen de pacientes: fuente cambiada');
    expect(acquisitionDetail({ reason: 'OTRA' })).toBeNull();
    expect(acquisitionDetail({})).toBeNull();
  });
});

describe('appointmentSeriesDetail (DX-562)', () => {
  const VE = { timeZone: 'America/Caracas', fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h23' }) };
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const series = {
    seriesId: '33333333-3333-4333-8333-333333333333',
    appointmentIds: ids,
    // 9:00 en Caracas (UTC−4).
    dates: ['2027-01-11T13:00:00.000Z', '2027-02-08T13:00:00.000Z'],
    intervalWeeks: 4,
  };
  const at = (iso: string) => VE.fmt.dateTime(new Date(iso), VE.timeZone);

  it('crear: cuántas, cada cuántas semanas y la primera y la última, en el reloj de la sede', () => {
    const detail = appointmentSeriesDetail({ reason: 'APPOINTMENT_SERIES_CREATED', appointmentSeries: series }, VE);
    expect(detail).toBe(`Serie de citas creada · 2 citas · cada 4 semanas · ${at(series.dates[0])} → ${at(series.dates[1])}`);
    expect(detail).toMatch(/09:00/);
    // Sin el reloj de la sede, «—»; nunca otro formato.
    expect(appointmentSeriesDetail({ reason: 'APPOINTMENT_SERIES_CREATED', appointmentSeries: series }, null)).toBe(
      'Serie de citas creada · 2 citas · cada 4 semanas · — → —',
    );
  });

  it('cancelar: cuántas y la cancelación de la primera (quién, motivo, aviso, tardía)', () => {
    expect(
      appointmentSeriesDetail(
        {
          reason: 'APPOINTMENT_SERIES_CANCELLED',
          appointmentSeries: { seriesId: series.seriesId, appointmentIds: ids },
          cancellation: { byKind: 'CLINIC', reasonCode: 'CLINIC_RESCHEDULE', noticeMinutes: 4320, lateCancellation: false },
        },
        VE,
      ),
    ).toMatch(/^Citas de la serie canceladas · 2 citas · .+ · aviso de 4320 min$/);
  });

  it('mover: cuántas y la hora de la cita pivote antes y después', () => {
    const move = {
      from: { start: '2027-02-08T13:00:00.000Z', end: '2027-02-08T13:30:00.000Z', providerId: ids[0] },
      to: { start: '2027-02-09T14:00:00.000Z', end: '2027-02-09T14:30:00.000Z', providerId: ids[0] },
    };
    expect(
      appointmentSeriesDetail(
        { reason: 'APPOINTMENT_SERIES_MOVED', appointmentSeries: { ...series, appointmentIds: [ids[1]] }, move },
        VE,
      ),
    ).toBe(`Citas de la serie movidas · 1 cita · Antes: ${at(move.from.start)} · Después: ${at(move.to.start)}`);
  });

  it('otro motivo: null', () => {
    expect(appointmentSeriesDetail({ reason: 'APPOINTMENT_MOVED' }, VE)).toBeNull();
  });
});
