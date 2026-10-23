import {
  AVATAR_MAX_DIMENSION,
  AVATAR_UPLOAD_MAX_BYTES,
  AvatarResizeError,
  prepareAvatarFile,
} from './avatar-resize';

const fileOf = (bytes: number, name = 'foto.png', type = 'image/png') =>
  new File([new Uint8Array(bytes)], name, { type });

describe('prepareAvatarFile (DX-259)', () => {
  it('una foto que ya cabe por el proxy (≤ 900 KB) sube tal cual', async () => {
    const encode = jest.fn();
    const file = fileOf(AVATAR_UPLOAD_MAX_BYTES);
    await expect(prepareAvatarFile(file, encode)).resolves.toBe(file);
    expect(encode).not.toHaveBeenCalled();
  });

  it('una más pesada se reduce a 512 px en JPEG, con el mismo nombre', async () => {
    const encode = jest.fn(async () => new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' }));
    const out = await prepareAvatarFile(fileOf(2 * 1024 * 1024, 'IMG_2041.PNG'), encode);
    expect(encode).toHaveBeenCalledWith(expect.any(File), AVATAR_MAX_DIMENSION);
    expect(out.name).toBe('IMG_2041.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(40_000);
  });

  it('si el navegador no puede reducirla, o sigue sin caber, AvatarResizeError', async () => {
    const big = fileOf(2 * 1024 * 1024);
    await expect(prepareAvatarFile(big, async () => null)).rejects.toBeInstanceOf(AvatarResizeError);
    await expect(
      prepareAvatarFile(big, async () => new Blob([new Uint8Array(AVATAR_UPLOAD_MAX_BYTES + 1)])),
    ).rejects.toBeInstanceOf(AvatarResizeError);
    await expect(
      prepareAvatarFile(big, async () => {
        throw new Error('formato ilegible');
      }),
    ).rejects.toBeInstanceOf(AvatarResizeError);
  });
});
