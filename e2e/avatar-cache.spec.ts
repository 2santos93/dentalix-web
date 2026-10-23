import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-259, OPS-039): el avatar se sirve con clave versionada y
 * `Cache-Control: immutable`, así que una segunda carga sale de la caché del
 * navegador sin pedir nada a la API; cambiarlo cambia su URL. Una foto de más
 * de 900 KB se reduce en el navegador antes de subirla (el proxy de la web
 * copia como mucho 1 MB).
 */
const PASSWORD = 'Password123!';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Ruido de 1400×1400 en PNG (varios MB): solo cabe por el proxy reducido. */
async function noisyPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(1400, 1400);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) >>> 24;
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

test('el avatar sale de la caché del navegador en la segunda carga y cambiarlo cambia su URL', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const origin = await registerAndLogin(page, {
    subdomain: `avatar-cache-${suffix}`,
    clinicName: `Avatar Caché ${suffix}`,
    fullName: 'Dra Caché',
    email: `avatar.cache.${suffix}@example.com`,
    password: PASSWORD,
  });
  const token = await accessTokenOf(page);
  const upload = await page.request.post(`${API_URL}/me/avatar`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Host': new URL(origin).host },
    multipart: { file: { name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1X1 } },
  });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const { avatarUrl } = (await upload.json()) as { avatarUrl: string };
  expect(avatarUrl).toMatch(/\/files\/avatars\/[0-9a-f-]{36}-[0-9a-f]{16}\.png$/);

  // Primera carga: la API responde 200 con la caché de un año e immutable.
  const first = page.waitForResponse((r) => r.url() === avatarUrl);
  await page.goto(`${origin}/settings/profile`);
  const firstRes = await first;
  expect(firstRes.status()).toBe(200);
  expect(firstRes.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  await expect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', avatarUrl);

  // Segunda carga: nada llega a la red (o sale de la caché de disco/memoria).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const fromNetwork: string[] = [];
  const fromCache = new Set<string>();
  cdp.on('Network.requestServedFromCache', ({ requestId }) => fromCache.add(requestId));
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    if (response.url !== avatarUrl) return;
    if (response.fromDiskCache || response.fromPrefetchCache || fromCache.has(requestId)) return;
    fromNetwork.push(`${response.status} ${response.url}`);
  });
  await page.reload();
  await expect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', avatarUrl, {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.getByRole('img', { name: 'Foto de perfil' }).evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  expect(fromNetwork, 'la segunda carga del avatar no pide nada a la API').toEqual([]);

  // Cambiarlo (una foto de varios MB, que se reduce antes de subirla) cambia
  // su URL; la subida por el proxy no pasa de 1 MB.
  const big = await noisyPng(page);
  expect(big.length).toBeGreaterThan(1024 * 1024);
  const sent = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/me/avatar');
  await page.getByLabel('Cambiar foto').setInputFiles({ name: 'foto-grande.png', mimeType: 'image/png', buffer: big });
  const request = await sent;
  expect(request.postDataBuffer()?.length ?? 0).toBeLessThan(1024 * 1024);
  const avatar = page.getByRole('img', { name: 'Foto de perfil' });
  await expect(avatar).not.toHaveAttribute('src', avatarUrl, { timeout: 15_000 });
  const nextUrl = (await avatar.getAttribute('src')) as string;
  expect(nextUrl).toMatch(/\/files\/avatars\/[0-9a-f-]{36}-[0-9a-f]{16}\.jpg$/);
  await expect.poll(() => avatar.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});
