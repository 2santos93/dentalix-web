import { canManageCollections, overdueChipText, todayLocal } from './presentation';

const money = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

describe('cobranza: presentación (DX-150)', () => {
  it('sin saldo vencido no hay chip', () => {
    expect(overdueChipText(undefined)).toBeNull();
    expect(overdueChipText({ hasOverdue: false, overdueDays: null })).toBeNull();
  });

  it('DENTIST/ASSISTANT: solo la marca y los días (la API no manda importe)', () => {
    expect(overdueChipText({ hasOverdue: true, overdueDays: 1 })).toBe('Saldo vencido · 1 día');
    expect(overdueChipText({ hasOverdue: true, overdueDays: 45 })).toBe('Saldo vencido · 45 días');
  });

  it('ADMIN/RECEPTION: añade el importe por moneda', () => {
    expect(
      money(
        overdueChipText({
          hasOverdue: true,
          overdueDays: 45,
          amounts: [{ currency: 'COP', amount: 300000 }],
        }),
      ),
    ).toMatch(/^Saldo vencido · 45 días · .*300\.000/);
  });

  it('solo ADMIN y RECEPTION gestionan la cobranza', () => {
    expect(canManageCollections('ADMIN')).toBe(true);
    expect(canManageCollections('RECEPTION')).toBe(true);
    expect(canManageCollections('DENTIST')).toBe(false);
    expect(canManageCollections('ASSISTANT')).toBe(false);
    expect(canManageCollections(null)).toBe(false);
  });

  it('hoy en la hora local del navegador', () => {
    expect(todayLocal(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
  });
});
