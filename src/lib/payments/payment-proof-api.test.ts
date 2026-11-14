import { apiFetch } from '@/lib/api/client';
import {
  PAYMENT_PROOF_ACCEPT,
  PAYMENT_PROOF_RULES,
  getPaymentProofUrl,
  isImageProof,
  requestPaymentProofUpload,
} from './payment-proof-api';
import { validateSingleFile } from '@/lib/files/upload-single-file';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => mockedFetch.mockReset());

it('pide la autorización de subida con tamaño y huella', async () => {
  mockedFetch.mockResolvedValue({ uploadId: 'u' });
  const request = { name: 'a.png', mimeType: 'image/png', size: 10, sha256: 'a'.repeat(64) };
  await requestPaymentProofUpload('tok', request);
  expect(mockedFetch).toHaveBeenCalledWith('/payments/proofs/upload-url', { method: 'POST', body: request, token: 'tok' });
});

it('pide la URL firmada con su disposición (inline por defecto)', async () => {
  mockedFetch.mockResolvedValue({});
  await getPaymentProofUrl('tok', 'pay-1');
  await getPaymentProofUrl('tok', 'pay-1', 'attachment');
  expect(mockedFetch.mock.calls.map((c) => c[0])).toEqual([
    '/payments/pay-1/proof/url?disposition=inline',
    '/payments/pay-1/proof/url?disposition=attachment',
  ]);
});

describe('reglas del comprobante en el navegador', () => {
  const check = (name: string, type: string, size = 100) => validateSingleFile({ name, type, size }, PAYMENT_PROOF_RULES);
  it('admite JPG, PNG, WebP, PDF y la HEIC del iPhone', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.pdf', 'application/pdf'],
      ['IMG_1.HEIC', 'image/heic'],
    ]) {
      expect(check(name, type)).toBeNull();
    }
    expect(PAYMENT_PROOF_ACCEPT).toContain('.webp');
  });
  it('rechaza otro tipo, vacío y más de 10 MB en español', () => {
    expect(check('a.docx', 'application/msword')).toMatch(/Tipo de archivo no admitido/);
    expect(check('a.png', 'image/png', 0)).toBe('El archivo está vacío.');
    expect(check('a.png', 'image/png', 10 * 1024 * 1024 + 1)).toBe('El comprobante supera el máximo de 10 MB.');
    expect(check('a.png', 'image/png', 10 * 1024 * 1024)).toBeNull();
  });
  it('las imágenes se pintan en <img>; el PDF, no', () => {
    expect(isImageProof('image/webp')).toBe(true);
    expect(isImageProof('application/pdf')).toBe(false);
  });
});
