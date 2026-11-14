import { canManageCollections, overdueChipText } from './presentation';
import { FORMAT_ES, FORMAT_US } from '@/lib/test/document-regional';

const money = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

describe('cobranza: presentación (DX-150)', () => {
  it('sin saldo vencido no hay chip', () => {
    expect(overdueChipText(undefined, FORMAT_ES.fmt)).toBeNull();
    expect(overdueChipText({ hasOverdue: false, overdueDays: null }, FORMAT_ES.fmt)).toBeNull();
  });

  it('DENTIST/ASSISTANT: solo la marca y los días (la API no manda importe)', () => {
    expect(overdueChipText({ hasOverdue: true, overdueDays: 1 }, FORMAT_ES.fmt)).toBe('Saldo vencido · 1 día');
    expect(overdueChipText({ hasOverdue: true, overdueDays: 45 }, FORMAT_ES.fmt)).toBe('Saldo vencido · 45 días');
  });

  it('ADMIN/RECEPTION: añade el importe por moneda', () => {
    expect(
      money(
        overdueChipText({
          hasOverdue: true,
          overdueDays: 45,
          amounts: [{ currency: 'USD', amount: 300000 }],
        }, FORMAT_ES.fmt),
      ),
    ).toMatch(/^Saldo vencido · 45 días · .*300\.000/);
  });

  it('DX-354: el importe sigue el formato de la sede y, sin él, es «—»', () => {
    const balance = { hasOverdue: true, overdueDays: 45, amounts: [{ currency: 'USD', amount: 300000 }] };
    expect(money(overdueChipText(balance, FORMAT_US.fmt))).toBe('Saldo vencido · 45 días · USD 300,000.00');
    expect(overdueChipText(balance, null)).toBe('Saldo vencido · 45 días');
  });

  it('solo ADMIN y RECEPTION gestionan la cobranza', () => {
    expect(canManageCollections('ADMIN')).toBe(true);
    expect(canManageCollections('RECEPTION')).toBe(true);
    expect(canManageCollections('DENTIST')).toBe(false);
    expect(canManageCollections('ASSISTANT')).toBe(false);
    expect(canManageCollections(null)).toBe(false);
  });
});
