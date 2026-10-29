/** DX-327: tipos de documento genéricos y el único resolvedor del nombre visible (R17). */
import {
  DOC_TYPE_LABEL,
  DOC_TYPE_LABEL_MAX,
  DOC_TYPE_NAME_MAX,
  DOC_TYPES,
  docTypeLabelTooLong,
  docTypeOptionLabel,
  documentText,
  documentTypeName,
  dtoDocTypeName,
  normalizeDocTypeLabel,
} from './doc-type';

describe('doc-type', () => {
  it('DOC_TYPES lists the five generic types in order', () => {
    expect(DOC_TYPES).toEqual(['NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'TAX_ID', 'OTHER']);
    expect(DOC_TYPE_LABEL_MAX).toBe(40);
    expect(DOC_TYPE_NAME_MAX).toBe(60);
  });

  it('DOC_TYPE_LABEL has the neutral label of each type', () => {
    expect(DOC_TYPE_LABEL).toEqual({
      NATIONAL_ID: 'Documento nacional',
      PASSPORT: 'Pasaporte',
      RESIDENCE_PERMIT: 'Permiso de residencia',
      TAX_ID: 'Identificación fiscal',
      OTHER: 'Otro documento',
    });
  });

  it("documentTypeName prefers the patient's label, then the clinic's local name, then the generic name", () => {
    const names = { NATIONAL_ID: 'ID local', PASSPORT: null };
    expect(documentTypeName('NATIONAL_ID', 'Documento A', names)).toBe('Documento A');
    expect(documentTypeName('NATIONAL_ID', null, names)).toBe('ID local');
    expect(documentTypeName('NATIONAL_ID', '', names)).toBe('ID local');
    expect(documentTypeName('PASSPORT', undefined, names)).toBe('Pasaporte');
    expect(documentTypeName('TAX_ID', null, {})).toBe('Identificación fiscal');
  });

  it('documentTypeName ignores prototype keys in the clinic names', () => {
    const inherited = Object.create({ OTHER: 'Heredado' }) as Record<string, string>;
    expect(documentTypeName('OTHER', null, inherited)).toBe('Otro documento');
    expect(documentTypeName('constructor', null, {})).toBe('constructor');
    expect(documentTypeName('__proto__', null, {})).toBe('__proto__');
  });

  it('documentText prints the name before the number', () => {
    expect(documentText('ID local', 'V-12.345.678')).toBe('ID local V-12.345.678');
  });

  it('documentText with no number is null', () => {
    expect(documentText('Pasaporte', null)).toBeNull();
    expect(documentText('Pasaporte', '')).toBeNull();
  });

  it('an unknown code renders as is', () => {
    expect(documentTypeName('ZZ', null, {})).toBe('ZZ');
    expect(dtoDocTypeName({ docType: 'ZZ' })).toBe('ZZ');
  });

  it("docTypeOptionLabel shows the clinic's local name or the generic one", () => {
    expect(docTypeOptionLabel('NATIONAL_ID', { NATIONAL_ID: 'ID local' })).toBe('ID local');
    expect(docTypeOptionLabel('RESIDENCE_PERMIT', { NATIONAL_ID: 'ID local' })).toBe(
      'Permiso de residencia',
    );
  });

  it('dtoDocTypeName prints the docTypeName of the DTO, or the generic name when it is missing', () => {
    expect(dtoDocTypeName({ docType: 'NATIONAL_ID', docTypeName: 'ID local' })).toBe('ID local');
    expect(dtoDocTypeName({ docType: 'PASSPORT', docTypeLabel: 'Documento A' })).toBe('Documento A');
    expect(dtoDocTypeName({ docType: 'TAX_ID' })).toBe('Identificación fiscal');
  });

  it('legacy codes from an older API resolve to their generic name, never a label', () => {
    expect(documentTypeName('CC', null, {})).toBe('Documento nacional');
    expect(documentTypeName('CE', null, { RESIDENCE_PERMIT: 'ID local' })).toBe('ID local');
  });

  it('normalizeDocTypeLabel trims, joins inner spaces and turns empty into null', () => {
    expect(normalizeDocTypeLabel('  ID   local ')).toBe('ID local');
    expect(normalizeDocTypeLabel('   ')).toBeNull();
    expect(normalizeDocTypeLabel('')).toBeNull();
  });

  it('docTypeLabelTooLong counts characters, not UTF-16 units, after normalizing', () => {
    expect(docTypeLabelTooLong('a'.repeat(DOC_TYPE_LABEL_MAX))).toBe(false);
    expect(docTypeLabelTooLong('a'.repeat(DOC_TYPE_LABEL_MAX + 1))).toBe(true);
    // 40 caracteres fuera del plano básico son 80 unidades UTF-16: caben.
    expect(docTypeLabelTooLong('\u{1D49C}'.repeat(DOC_TYPE_LABEL_MAX))).toBe(false);
    expect(docTypeLabelTooLong('\u{1D49C}'.repeat(DOC_TYPE_LABEL_MAX + 1))).toBe(true);
    expect(docTypeLabelTooLong(`  ${'a'.repeat(DOC_TYPE_LABEL_MAX)}  `)).toBe(false);
  });
});
