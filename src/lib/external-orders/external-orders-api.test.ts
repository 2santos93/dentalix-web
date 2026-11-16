import {
  canIssueExternalOrders,
  canManageExternalOrderSettings,
  canSeeClinicalNote,
  canUnlinkExternalOrderResult,
  canVoidExternalOrder,
  cleanLines,
  EXTERNAL_ORDER_KIND_LABELS,
  EXTERNAL_ORDER_STATUS_LABELS,
} from './external-orders-api';
import { statusLabel } from '@/lib/status/tones';

describe('external-orders-api (DX-572)', () => {
  it('roles: emiten DENTIST y ADMIN; la nota, los clínicos; los ajustes, ADMIN', () => {
    expect(['DENTIST', 'ADMIN', 'ASSISTANT', 'RECEPTION'].filter((r) => canIssueExternalOrders(r as 'ADMIN'))).toEqual([
      'DENTIST',
      'ADMIN',
    ]);
    expect(canSeeClinicalNote('ASSISTANT')).toBe(true);
    expect(canSeeClinicalNote('RECEPTION')).toBe(false);
    expect(canManageExternalOrderSettings('ADMIN')).toBe(true);
    expect(canManageExternalOrderSettings('DENTIST')).toBe(false);
  });

  it('anular: ADMIN o quien la emitió, y solo emitida', () => {
    const order = { status: 'ISSUED' as const, issuedById: 'u1' };
    expect(canVoidExternalOrder(order, { role: 'DENTIST', userId: 'u1' })).toBe(true);
    expect(canVoidExternalOrder(order, { role: 'DENTIST', userId: 'u2' })).toBe(false);
    expect(canVoidExternalOrder(order, { role: 'ADMIN', userId: 'u2' })).toBe(true);
    expect(canVoidExternalOrder({ ...order, status: 'RESULT_RECEIVED' }, { role: 'ADMIN', userId: 'u2' })).toBe(false);
  });

  it('desligar: un rol clínico o quien lo ligó', () => {
    const order = { status: 'RESULT_RECEIVED' as const, resultLinkedById: 'u-rec' };
    expect(canUnlinkExternalOrderResult(order, { role: 'RECEPTION', userId: 'u-rec' })).toBe(true);
    expect(canUnlinkExternalOrderResult(order, { role: 'RECEPTION', userId: 'u-otro' })).toBe(false);
    expect(canUnlinkExternalOrderResult(order, { role: 'ASSISTANT', userId: 'u-otro' })).toBe(true);
    expect(canUnlinkExternalOrderResult({ ...order, status: 'ISSUED' }, { role: 'ADMIN', userId: 'u' })).toBe(false);
  });

  it('etiquetas de tipo y de estado, las mismas que el mapa de tonos', () => {
    expect(Object.values(EXTERNAL_ORDER_KIND_LABELS)).toEqual(['Imagen', 'Laboratorio clínico', 'Especialista', 'Otro']);
    for (const [status, label] of Object.entries(EXTERNAL_ORDER_STATUS_LABELS)) {
      expect(statusLabel('externalOrder', status as 'ISSUED')).toBe(label);
    }
  });

  it('cleanLines quita las vacías y recorta', () => {
    expect(cleanLines([' Panorámica ', '', '  ', 'Periapical'])).toEqual(['Panorámica', 'Periapical']);
  });
});
