import { partyDocument } from './responsible-parties-api';

// SEC-044: DENTIST y ASSISTANT reciben `docNumber: null` del responsable; la
// ficha no debe pintar un documento vacío ni romperse.
describe('partyDocument sin número (SEC-044)', () => {
  it('devuelve null cuando la API recorta el número, con o sin tipo', () => {
    expect(
      partyDocument({ docType: 'NATIONAL_ID', docTypeLabel: null, docTypeName: 'Cédula', docNumber: null }),
    ).toBeNull();
    expect(partyDocument({ docType: null, docTypeLabel: null, docTypeName: null, docNumber: null })).toBeNull();
  });

  it('con número sigue mostrando «tipo número»', () => {
    expect(
      partyDocument({ docType: 'NATIONAL_ID', docTypeLabel: null, docTypeName: 'Cédula', docNumber: '12345678' }),
    ).toContain('12345678');
  });
});
