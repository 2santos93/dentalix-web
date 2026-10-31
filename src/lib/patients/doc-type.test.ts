/** DX-327: tipos de documento genéricos y el único resolvedor del nombre visible (R17). */
import {
  DOC_TYPE_LABEL,
  DOC_TYPE_LABEL_MAX,
  DOC_TYPE_NAME_MAX,
  DOC_TYPES,
  docTypeLabelError,
  docTypeNameError,
  normalizeDocTypeName,
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

  it('an unknown code renders as is and never takes a local name', () => {
    expect(documentTypeName('XX', null, {})).toBe('XX');
    expect(documentTypeName('constructor', null, { NATIONAL_ID: 'ID local' })).toBe('constructor');
  });

  it('normalizeDocTypeLabel trims, joins inner spaces and turns empty into null', () => {
    expect(normalizeDocTypeLabel('  ID   local ')).toBe('ID local');
    expect(normalizeDocTypeLabel('   ')).toBeNull();
    expect(normalizeDocTypeLabel('')).toBeNull();
  });

  it('docTypeLabelError counts characters, not UTF-16 units, after normalizing', () => {
    expect(docTypeLabelError('a'.repeat(DOC_TYPE_LABEL_MAX))).toBeNull();
    expect(docTypeLabelError('a'.repeat(DOC_TYPE_LABEL_MAX + 1))).toBe('tooLong');
    // 40 caracteres fuera del plano básico son 80 unidades UTF-16.
    expect(docTypeLabelError('\u{1D49C}'.repeat(DOC_TYPE_LABEL_MAX))).toBeNull();
    expect(docTypeLabelError('\u{1D49C}'.repeat(DOC_TYPE_LABEL_MAX + 1))).toBe('tooLong');
    expect(docTypeLabelError(`  ${'a'.repeat(DOC_TYPE_LABEL_MAX)}  `)).toBeNull();
    expect(docTypeLabelError(`${'a'.repeat(20)}     ${'a'.repeat(19)}`)).toBeNull();
    expect(docTypeLabelError('')).toBeNull();
    expect(docTypeLabelError('   ')).toBeNull();
  });

  it.each([
    ['a zero-width space', 'ID\u200Blocal'],
    ['a right-to-left override', 'ID \u202Elocal'],
    ['a soft hyphen', 'ID\u00ADlocal'],
    ['a lone high surrogate', 'ID \uD800'],
    ['a lone low surrogate', 'ID \uDC00'],
    ['a bell', 'ID\u0007'],
    ['a DEL', 'ID\u007F'],
  ])('docTypeLabelError rejects %s like the API', (_what, value) => {
    expect(docTypeLabelError(value)).toBe('control');
  });

  it('docTypeLabelError checks control characters before length, like the API', () => {
    expect(docTypeLabelError(`${'a'.repeat(DOC_TYPE_LABEL_MAX + 5)}\u200B`)).toBe('control');
  });

  it('docTypeLabelError accepts any script and joined spaces (tabs and new lines are spaces)', () => {
    for (const value of ['Паспорт', 'جواز سفر', '身份证', 'ID\tlocal', 'ID\nlocal', '\u{1F600} ID']) {
      expect([value, docTypeLabelError(value)]).toEqual([value, null]);
    }
  });

  it('normalizeDocTypeName joins spaces like the API, and empty is null', () => {
    expect(normalizeDocTypeName('  ID   local\t ')).toBe('ID local');
    expect(normalizeDocTypeName(' \n ')).toBeNull();
  });

  it('docTypeNameError: 60 characters, control characters and at least one letter or number', () => {
    expect(docTypeNameError('a'.repeat(DOC_TYPE_NAME_MAX))).toBeNull();
    expect(docTypeNameError('\u{1D49C}'.repeat(DOC_TYPE_NAME_MAX))).toBeNull();
    expect(docTypeNameError('\u{1D49C}'.repeat(DOC_TYPE_NAME_MAX + 1))).toBe('tooLong');
    expect(docTypeNameError(`  ${'a'.repeat(30)}    ${'a'.repeat(29)}  `)).toBeNull();
    expect(docTypeNameError('ID\u200Blocal')).toBe('control');
    expect(docTypeNameError('ID \uD800')).toBe('control');
    expect(docTypeNameError('---')).toBe('noLetter');
    expect(docTypeNameError('★ ·')).toBe('noLetter');
    // NFKD lo parte en flecha y marca; la API lo recompone y queda sin letras.
    expect(docTypeNameError('↚')).toBe('noLetter');
    expect(docTypeNameError('')).toBeNull();
    for (const value of ['ID', '身份证', '①', 'Nº 1', 'ガ']) {
      expect([value, docTypeNameError(value)]).toEqual([value, null]);
    }
  });
});
