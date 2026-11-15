import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import {
  canManageDuplicates,
  countLines,
  dismissDuplicate,
  getMergePreview,
  groupDiffers,
  listDuplicates,
  MERGE_FIELD_GROUPS,
  mergeFieldsBody,
  mergePatients,
  type MergeSide,
} from './patient-merge-api';
import { mergeFields } from '@/lib/test/patient-merge';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchOrNull: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedFetchOrNull = apiFetchOrNull as jest.MockedFunction<typeof apiFetchOrNull>;

describe('patient-merge-api (DX-266)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetchOrNull.mockReset();
  });

  it('solo ADMIN gestiona los duplicados', () => {
    expect(canManageDuplicates('ADMIN')).toBe(true);
    expect(canManageDuplicates('RECEPTION')).toBe(false);
    expect(canManageDuplicates('DENTIST')).toBe(false);
    expect(canManageDuplicates('ASSISTANT')).toBe(false);
    expect(canManageDuplicates(null)).toBe(false);
  });

  it('pide la página con su tamaño y, con sede, su locationId', async () => {
    mockedFetch.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await listDuplicates('tok', { page: 2 });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patient-duplicates?page=2&pageSize=20', { token: 'tok' });
    await listDuplicates('tok', { page: 1, locationId: 'sede-1' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patient-duplicates?page=1&pageSize=20&locationId=sede-1', {
      token: 'tok',
    });
  });

  it('«No es duplicado», vista previa y fusión van a sus rutas', async () => {
    await dismissDuplicate('tok', ['a', 'b']);
    expect(mockedFetchOrNull).toHaveBeenCalledWith('/patient-duplicates/dismissals', {
      method: 'POST',
      body: { patientIds: ['a', 'b'] },
      token: 'tok',
    });
    await getMergePreview('tok', 'k', 'x');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patient-duplicates/merge-preview?keptId=k&absorbedId=x', {
      token: 'tok',
    });
    await mergePatients('tok', { keptId: 'k', absorbedId: 'x', fields: { phone: 'ABSORBED' } });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patient-duplicates/merge', {
      method: 'POST',
      body: { keptId: 'k', absorbedId: 'x', fields: { phone: 'ABSORBED' } },
      token: 'tok',
    });
  });

  it('el cuerpo solo lleva los grupos que se toman de la absorbida', () => {
    expect(mergeFieldsBody({})).toBeUndefined();
    expect(mergeFieldsBody({ phone: 'KEPT', email: 'KEPT' })).toBeUndefined();
    expect(mergeFieldsBody({ phone: 'ABSORBED', document: 'ABSORBED', email: 'KEPT' })).toEqual({
      document: 'ABSORBED',
      phone: 'ABSORBED',
    });
  });

  it('un grupo difiere si cambia cualquiera de sus columnas; vacío y null cuentan igual', () => {
    const doc = MERGE_FIELD_GROUPS.find((g) => g.group === 'document')!.columns;
    expect(groupDiffers(doc, mergeFields(), mergeFields())).toBe(false);
    expect(groupDiffers(doc, mergeFields(), mergeFields({ docNumber: '12345678' }))).toBe(true);
    expect(groupDiffers(doc, mergeFields(), mergeFields({ documentType: 'PASSPORT' }))).toBe(true);
    const address = MERGE_FIELD_GROUPS.find((g) => g.group === 'address')!.columns;
    expect(groupDiffers(address, mergeFields(), mergeFields({ cityId: 7 }))).toBe(true);
  });

  it('los grupos son los catorce de la API, sin repetir', () => {
    expect(MERGE_FIELD_GROUPS.map((g) => g.group)).toEqual([
      'firstName',
      'lastName',
      'document',
      'birthDate',
      'sex',
      'phone',
      'email',
      'address',
      'maritalStatus',
      'occupation',
      'physician',
      'emergencyContact',
      'notes',
      'preferredLanguage',
    ]);
  });

  it('lo que se mueve: sin ceros ni «otros», con singular y plural', () => {
    const side = {
      counts: [
        { category: 'appointments', count: 3 },
        { category: 'prescriptions', count: 1 },
        { category: 'payments', count: 0 },
        { category: 'other', count: 9 },
      ],
    } as MergeSide;
    expect(countLines(side)).toEqual(['3 citas', '1 receta']);
  });
});
