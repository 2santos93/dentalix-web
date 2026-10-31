import { STATUS_PRESENTATION, statusLabel, statusLabels, statusTone, statusTones, TONE_CLASSES } from './tones';

describe('vocabulario de estados (tones.ts)', () => {
  it('sigue la regla de tonos de DESIGN.md en los estados clave', () => {
    expect(statusTone('appointment', 'COMPLETED')).toBe('success');
    expect(statusTone('appointment', 'CONFIRMED')).toBe('info');
    expect(statusTone('appointment', 'IN_CHAIR')).toBe('info');
    expect(statusTone('appointment', 'NO_SHOW')).toBe('danger');
    expect(statusTone('appointment', 'SCHEDULED')).toBe('neutral');
    expect(statusTone('appointment', 'CANCELLED')).toBe('neutral');
    expect(statusTone('installment', 'PAID')).toBe('success');
    expect(statusTone('installment', 'PENDING')).toBe('warning');
    expect(statusTone('installment', 'PARTIAL')).toBe('warning');
    expect(statusTone('installment', 'OVERDUE')).toBe('danger');
    expect(statusTone('expense', 'PARTIAL')).toBe('warning');
    expect(statusTone('expense', 'VOIDED')).toBe('neutral');
    expect(statusTone('treatmentPlan', 'ACCEPTED')).toBe('info');
    expect(statusTone('treatmentPlan', 'REJECTED')).toBe('danger');
    expect(statusTone('treatmentPlan', 'CANCELLED')).toBe('neutral');
    expect(statusTone('treatmentPlan', 'DRAFT')).toBe('neutral');
  });

  it('«Anulado», «Pendiente», «Parcial» y «Vencido» tienen un solo tono en todo el producto', () => {
    const byLabel = new Map<string, Set<string>>();
    for (const [kind, map] of Object.entries(STATUS_PRESENTATION)) {
      if (kind === 'invitationEmail') continue; // «Correo: Pendiente» es el despachador trabajando.
      for (const { tone, label } of Object.values(map)) {
        const key = label.toLowerCase().replace(/[aoe]$/, '');
        if (!byLabel.has(key)) byLabel.set(key, new Set());
        byLabel.get(key)!.add(tone);
      }
    }
    for (const word of ['anulad', 'pendient', 'parcial', 'vencid']) {
      expect([word, byLabel.get(word)?.size]).toEqual([word, 1]);
    }
  });

  it('los métodos de pago son categorías neutras, no estados', () => {
    expect(Object.values(statusTones('paymentMethod'))).toEqual(['neutral', 'neutral', 'neutral', 'neutral']);
  });

  it('las etiquetas son frases en mayúscula inicial y reutilizan el texto existente', () => {
    expect(statusLabel('appointment', 'ARRIVED')).toBe('En espera');
    expect(statusLabels('staff')).toEqual({ ACTIVE: 'Activo', PENDING: 'Pendiente', INACTIVE: 'Inactivo' });
    expect(statusLabels('treatmentPlanItem')).toEqual({ PROPOSED: 'Propuesto', ACCEPTED: 'Aceptado', DONE: 'Realizado' });
    for (const map of Object.values(STATUS_PRESENTATION)) {
      for (const { label } of Object.values(map)) {
        if (label === '—' || label === 'OK') continue;
        expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
      }
    }
  });

  it('ningún tono usa el acento de la clínica', () => {
    for (const classes of Object.values(TONE_CLASSES)) {
      expect(Object.values(classes).join(' ')).not.toMatch(/primary|accent/);
    }
  });
});
