import heic2any from 'heic2any';
import {
  convertHeicToJpeg,
  HEIC_CONVERSION_ERROR,
  HeicConversionError,
  isHeicFile,
} from './heic';

jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));

const mockedHeic2any = heic2any as jest.MockedFunction<typeof heic2any>;

describe('HEIC → JPG en el navegador (DX-151)', () => {
  beforeEach(() => mockedHeic2any.mockReset());

  it('reconoce HEIC por tipo o por extensión', () => {
    expect(isHeicFile({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'foto', type: 'image/heic' })).toBe(true);
    expect(isHeicFile({ name: 'foto.heif', type: 'image/heif' })).toBe(true);
    expect(isHeicFile({ name: 'radio.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('convierte a un File JPG con el mismo nombre', async () => {
    mockedHeic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const out = await convertHeicToJpeg(new File(['heic'], 'IMG_0001.HEIC', { type: 'image/heic' }));
    expect(mockedHeic2any).toHaveBeenCalledWith(expect.objectContaining({ toType: 'image/jpeg' }));
    expect(out.name).toBe('IMG_0001.jpg');
    expect(out.type).toBe('image/jpeg');
  });

  it('si heic2any devuelve varias imágenes, usa la primera', async () => {
    mockedHeic2any.mockResolvedValue([new Blob(['a'], { type: 'image/jpeg' }), new Blob(['b'])]);
    const out = await convertHeicToJpeg(new File(['heic'], 'live.heic'));
    expect(out.size).toBe(1);
  });

  it('si la conversión falla, error en español', async () => {
    mockedHeic2any.mockRejectedValue(new Error('ERR_LIBHEIF format not supported'));
    const err = await convertHeicToJpeg(new File(['x'], 'x.heic')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HeicConversionError);
    expect(HEIC_CONVERSION_ERROR).toBe('No pudimos convertir la foto HEIC; expórtala como JPG.');
  });
});
