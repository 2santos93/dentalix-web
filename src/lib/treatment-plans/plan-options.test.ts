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

function plan(overrides: Partial<TreatmentPlan> & { id: string }): TreatmentPlan {
  return {
    tenantId: 't1',
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'COP',
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
  it('saluda, nombra la clínica y la fecha, sin datos clínicos', () => {
    const text = followUpMessage({
      patientName: 'Ana Pérez',
      clinicName: 'Clínica Sonrisa',
      presentedAt: '2026-10-07T15:00:00.000Z',
    });
    expect(text).toBe(
      'Hola Ana, te escribimos de Clínica Sonrisa por el presupuesto que te presentamos el 07/10/2026. ¿Te quedó alguna duda o quieres agendar para empezar?',
    );
  });

  it('sin clínica conocida dice «de la clínica»', () => {
    expect(
      followUpMessage({ patientName: 'Ana', clinicName: null, presentedAt: '2026-10-07T15:00:00.000Z' }),
    ).toContain('te escribimos de la clínica por');
  });

  it('wa.me con el número E.164 y el texto codificado; sin número, null', () => {
    const href = followUpWhatsAppHref(
      { patientName: 'Ana', patientWhatsApp: '573001112222', presentedAt: '2026-10-07T15:00:00.000Z' },
      'Sonrisa',
    );
    expect(href?.startsWith('https://wa.me/573001112222?text=Hola%20Ana')).toBe(true);
    expect(
      followUpWhatsAppHref(
        { patientName: 'Ana', patientWhatsApp: null, presentedAt: '2026-10-07T15:00:00.000Z' },
        'Sonrisa',
      ),
    ).toBeNull();
  });
});

describe('nextOptionLabel', () => {
  it('la letra siguiente; un plan suelto deja la B', () => {
    expect(nextOptionLabel(0)).toBe('Opción B');
    expect(nextOptionLabel(2)).toBe('Opción C');
    expect(nextOptionLabel(26)).toBe('Opción 27');
  });
});
