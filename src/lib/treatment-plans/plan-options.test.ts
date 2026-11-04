import {
  canCreateAlternative,
  canDecidePlan,
  canPresentPlan,
  canRejectPlan,
  canRejectThisPlan,
  canSeeFollowUp,
  followUpMessage,
  followUpWhatsAppHref,
  nextOptionLabel,
  optionGroupOf,
  patchableStatuses,
  REJECTION_REASON_LABELS,
  SELECTABLE_REJECTION_REASONS,
} from './plan-options';
import type { TreatmentPlan } from './treatment-plans-api';
import { dateIn, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';

function plan(overrides: Partial<TreatmentPlan> & { id: string }): TreatmentPlan {
  return {
    tenantId: 't1',
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'USD',
    notes: null,
    createdById: null,
    optionGroupId: null,
    optionLabel: null,
    presentedAt: null,
    presentedLocationId: null,
    rejectedAt: null,
    rejectionReason: null,
    rejectionNote: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('permisos sobre el plan (DX-040)', () => {
  it('presentar y aceptar: odontólogo y ADMIN', () => {
    expect(canDecidePlan('ADMIN')).toBe(true);
    expect(canDecidePlan('DENTIST')).toBe(true);
    expect(canDecidePlan('ASSISTANT')).toBe(false);
    expect(canDecidePlan('RECEPTION')).toBe(false);
    expect(canDecidePlan(null)).toBe(false);
  });

  it('rechazar: además recepción; la asistente no', () => {
    expect(canRejectPlan('RECEPTION')).toBe(true);
    expect(canRejectPlan('DENTIST')).toBe(true);
    expect(canRejectPlan('ASSISTANT')).toBe(false);
  });

  it('la lista de seguimiento: ADMIN y recepción', () => {
    expect(canSeeFollowUp('ADMIN')).toBe(true);
    expect(canSeeFollowUp('RECEPTION')).toBe(true);
    expect(canSeeFollowUp('DENTIST')).toBe(false);
    expect(canSeeFollowUp('ASSISTANT')).toBe(false);
  });
});

describe('acciones según el estado', () => {
  it('se presenta un borrador con ítems', () => {
    const draft = plan({ id: 'a', items: [{} as never] });
    expect(canPresentPlan(draft, 'DENTIST')).toBe(true);
    expect(canPresentPlan(draft, 'ASSISTANT')).toBe(false);
    expect(canPresentPlan({ ...draft, items: [] }, 'DENTIST')).toBe(false);
    expect(canPresentPlan({ ...draft, status: 'PRESENTED' }, 'DENTIST')).toBe(false);
  });

  it('se rechaza un plan presentado', () => {
    expect(canRejectThisPlan(plan({ id: 'a', status: 'PRESENTED' }), 'RECEPTION')).toBe(true);
    expect(canRejectThisPlan(plan({ id: 'a', status: 'DRAFT' }), 'DENTIST')).toBe(false);
  });

  it('no se crea una alternativa si una opción del grupo ya se eligió', () => {
    const a = plan({ id: 'a', optionGroupId: 'a', status: 'ACCEPTED' });
    const b = plan({ id: 'b', optionGroupId: 'a', status: 'REJECTED' });
    expect(canCreateAlternative(b, [a, b])).toBe(false);
    expect(canCreateAlternative(plan({ id: 'x' }), [])).toBe(true);
    expect(canCreateAlternative(plan({ id: 'y', status: 'COMPLETED' }), [])).toBe(false);
  });
});

describe('patchableStatuses', () => {
  it('ofrece el estado actual y sus transiciones del PATCH (sin presentar ni rechazar)', () => {
    expect(patchableStatuses('DRAFT', 'DENTIST')).toEqual(['DRAFT', 'ACCEPTED', 'CANCELLED']);
    expect(patchableStatuses('PRESENTED', 'ADMIN')).toEqual([
      'PRESENTED',
      'ACCEPTED',
      'CANCELLED',
    ]);
    expect(patchableStatuses('ACCEPTED', 'DENTIST')).toEqual([
      'ACCEPTED',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(patchableStatuses('REJECTED', 'DENTIST')).toEqual(['REJECTED', 'CANCELLED']);
    expect(patchableStatuses('COMPLETED', 'DENTIST')).toEqual(['COMPLETED']);
    expect(patchableStatuses('CANCELLED', 'DENTIST')).toEqual(['CANCELLED']);
  });

  it('la asistente no ve «Aceptado» como destino', () => {
    expect(patchableStatuses('DRAFT', 'ASSISTANT')).toEqual(['DRAFT', 'CANCELLED']);
  });
});

describe('optionGroupOf', () => {
  it('las opciones del grupo del plan, por etiqueta', () => {
    const plans = [
      plan({ id: 'b', optionGroupId: 'a', optionLabel: 'Opción B' }),
      plan({ id: 'x' }),
      plan({ id: 'a', optionGroupId: 'a', optionLabel: 'Opción A' }),
    ];
    expect(optionGroupOf(plans, plans[0]).map((p) => p.id)).toEqual(['a', 'b']);
    expect(optionGroupOf(plans, plans[1])).toEqual([]);
  });
});

describe('motivos de rechazo', () => {
  it('el personal elige del catálogo; «otra opción aceptada» es del sistema', () => {
    expect(SELECTABLE_REJECTION_REASONS).toEqual(['PRICE', 'FEAR', 'SECOND_OPINION', 'OTHER']);
    expect(REJECTION_REASON_LABELS.OTHER_OPTION_ACCEPTED).toBe('Aceptó otra opción');
  });
});

describe('mensaje de WhatsApp', () => {
  const caracas = testStamp([STAMP_SEDES.caracas, STAMP_SEDES.berlin]);
  const presentedAt = '2026-11-05T02:00:00.000Z'; // en Caracas aún es el 4; en Berlín, el 5

  it('saluda, nombra la clínica y la fecha de la sede de la pantalla (es-VE), sin datos clínicos', () => {
    const text = followUpMessage({ patientName: 'Ana Pérez', clinicName: 'Clínica Sonrisa', presentedAt }, caracas);
    expect(text).toBe(
      `Hola Ana, te escribimos de Clínica Sonrisa por el presupuesto que te presentamos el ${dateIn('caracas', presentedAt)}. ¿Te quedó alguna duda o quieres agendar para empezar?`,
    );
    expect(dateIn('caracas', presentedAt)).toBe('04/11/2026');
  });

  it('con la sede donde se presentó, la fecha es la de esa sede', () => {
    const text = followUpMessage(
      { patientName: 'Ana', clinicName: null, presentedAt, presentedLocationId: STAMP_SEDES.berlin.id },
      caracas,
    );
    expect(text).toContain(`el ${dateIn('berlin', presentedAt)}.`);
    expect(dateIn('berlin', presentedAt)).not.toBe(dateIn('caracas', presentedAt));
  });

  it('sin clínica conocida dice «de la clínica»', () => {
    expect(followUpMessage({ patientName: 'Ana', clinicName: null, presentedAt }, caracas)).toContain(
      'te escribimos de la clínica por',
    );
  });

  it('sin formato de la sede (o con una sede desconocida) la frase no se envía: null, nunca «—»', () => {
    expect(followUpMessage({ patientName: 'Ana', clinicName: null, presentedAt }, stampPainters(null))).toBeNull();
    expect(
      followUpMessage({ patientName: 'Ana', clinicName: null, presentedAt, presentedLocationId: 'otra' }, caracas),
    ).toBeNull();
    const item = { patientName: 'Ana', patientWhatsApp: '584121112222', presentedAt };
    expect(followUpWhatsAppHref(item, 'Sonrisa', stampPainters(null))).toBeNull();
  });

  it('wa.me con el número E.164 y el texto codificado; sin número, null', () => {
    const href = followUpWhatsAppHref(
      { patientName: 'Ana', patientWhatsApp: '584121112222', presentedAt },
      'Sonrisa',
      caracas,
    );
    expect(href?.startsWith('https://wa.me/584121112222?text=Hola%20Ana')).toBe(true);
    expect(decodeURIComponent(href ?? '')).not.toContain('—');
    expect(
      followUpWhatsAppHref({ patientName: 'Ana', patientWhatsApp: null, presentedAt }, 'Sonrisa', caracas),
    ).toBeNull();
  });
});

describe('nextOptionLabel', () => {
  it('un plan suelto deja la B; en un grupo, la letra siguiente sin repetir', () => {
    expect(nextOptionLabel(plan({ id: 'a' }), [])).toBe('Opción B');
    const a = plan({ id: 'a', optionGroupId: 'a', optionLabel: 'Opción A' });
    const c = plan({ id: 'c', optionGroupId: 'a', optionLabel: 'Opción C' });
    expect(nextOptionLabel(a, [a, c])).toBe('Opción D');
    const named = plan({ id: 'x', optionLabel: 'Implante' });
    expect(nextOptionLabel(named, [])).toBe('Opción B');
  });
});
