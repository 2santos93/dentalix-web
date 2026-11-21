import { test, expect, type Page, type Route } from './support/test';
import { randomUUID } from 'node:crypto';
import { axeViolations } from './support/axe';
import { shot } from './support/qa-shot';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-588: el televisor de la sala de espera (`/sala/[token]`) con la API
 * pública simulada (`page.route`), para fijar lo que es solo de la pantalla:
 * 1920×1080 sin scroll con los tamaños mínimos, apaisados menores, oscuro
 * aunque el sistema esté en claro, axe limpio, sin nada enfocable, destacado
 * de quien pasa a consulta, «Sin conexión» y su recuperación, y el aviso de
 * pantalla inactiva. El recorrido contra la API real (Ajustes → enlace →
 * tablero → revocar) está en `waiting-room-settings.spec.ts`.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const origin = tenantOrigin(`sala-${suffix}`.slice(0, 40));
const TOKEN = 'wrs_e2e_mock_token';
const BOARD_PATH = `**/public/waiting-room/${TOKEN}`;

const NAMES = [
  'Ana R.',
  'José P.',
  'María G.',
  'Luis M.',
  'Carmen V.',
  'Pedro S.',
  'Rosa D.',
  'Jesús H.',
  'Yolanda T.',
  'Miguel A.',
  'Gabriela F.',
  'Rafael C.',
  'Daniela L.',
  'Andrés B.',
  'Valentina Q.',
];

function board(over: Record<string, unknown> = {}) {
  return {
    screenName: 'Televisor recepción',
    locationName: 'Sede Chacao',
    nameMode: 'NAME_INITIAL',
    messages: ['Horario: lunes a viernes de 8:00 a 17:00', 'Recuerda traer tu cédula'],
    soundEnabled: false,
    timeZone: 'America/Caracas',
    locale: 'es-VE',
    hourCycle: 'h12',
    now: new Date().toISOString(),
    refreshSeconds: 8,
    waiting: NAMES.map((label, i) => ({ key: `w${i}`, label, minutesWaiting: 30 - i * 2 })),
    called: NAMES.slice(0, 8).map((label, i) => ({
      key: `c${i}`,
      label,
      chairName: `Sillón ${i + 1}`,
      providerName: i % 2 ? 'Dra. Pérez' : 'Dr. Rojas',
      minutesSinceCalled: i,
    })),
    ...over,
  };
}

type Reply = { status: number; body?: unknown } | 'abort';

/** La API pública simulada: cada sondeo toma la respuesta que diga `next()`. */
async function mockBoard(page: Page, next: () => Reply) {
  const calls = { count: 0 };
  await page.route(BOARD_PATH, async (route: Route) => {
    calls.count += 1;
    const reply = next();
    if (reply === 'abort') return route.abort('internetdisconnected');
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(reply.body ?? {}),
    });
  });
  return calls;
}

async function openBoard(page: Page) {
  await page.goto(`${origin}/sala/${TOKEN}`);
  await expect(page.getByTestId('waiting-room-board')).toBeVisible();
}

/** Tamaño de letra más pequeño de todo el texto visible. */
async function smallestFont(page: Page): Promise<{ size: number; text: string }> {
  return page.evaluate(() => {
    let smallest = { size: Infinity, text: '' };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || !el.closest('[data-testid="waiting-room-board"]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < smallest.size) smallest = { size, text };
    }
    return smallest;
  });
}

async function expectNoScroll(page: Page) {
  const { scrollHeight, innerHeight, scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement!.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollHeight, 'scroll vertical').toBeLessThanOrEqual(innerHeight);
  expect(scrollWidth, 'scroll horizontal').toBeLessThanOrEqual(innerWidth);
}

test.describe('DX-588 · pantalla de sala de espera (televisor)', () => {
  test('1920×1080: sin scroll, «y N más», tamaños para 4 m, oscuro en un sistema claro, axe limpio y nada enfocable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await mockBoard(page, () => ({ status: 200, body: board() }));
    await openBoard(page);

    const waiting = page.getByTestId('waiting-room-waiting');
    const called = page.getByTestId('waiting-room-called');
    await expect(waiting.getByTestId('waiting-room-waiting-item').first()).toHaveText(/Ana R\./);
    await expect(waiting.getByTestId('waiting-room-more')).toHaveText(/^y \d+ más$/);
    await expect(called.getByTestId('waiting-room-more')).toHaveText(/^y \d+ más$/);
    const shownWaiting = await waiting.getByTestId('waiting-room-waiting-item').count();
    const more = Number((await waiting.getByTestId('waiting-room-more').textContent())!.match(/\d+/)![0]);
    expect(shownWaiting + more).toBe(NAMES.length);
    await expectNoScroll(page);

    // Nombres ≥ 56 px, secundarios ≥ 36 px y nada por debajo de 32 px.
    const nameSize = await waiting
      .getByTestId('waiting-room-waiting-item')
      .first()
      .locator('span')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(nameSize).toBeGreaterThanOrEqual(56);
    const secondarySize = await called
      .getByTestId('waiting-room-called-item')
      .first()
      .locator(':scope > span')
      .nth(1)
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(secondarySize).toBeGreaterThanOrEqual(36);
    const smallest = await smallestFont(page);
    expect(smallest.size, `«${smallest.text}»`).toBeGreaterThanOrEqual(32);

    // Oscuro aunque el sistema esté en claro, y sin cursor.
    const root = page.getByTestId('waiting-room-board');
    await expect(root).toHaveClass(/\bdark\b/);
    expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 15, 20)');
    expect(await root.evaluate((el) => getComputedStyle(el).cursor)).toBe('none');
    await expect(page.getByTestId('waiting-room-clock')).toHaveText(/\d{1,2}:\d{2}/);
    await expect(page.getByTestId('waiting-room-message')).toHaveText('Horario: lunes a viernes de 8:00 a 17:00');

    // Nada enfocable: el tabulador no entra en la pantalla.
    expect(
      await root.evaluate((el) => el.querySelectorAll('a, button, input, select, textarea, [tabindex]').length),
    ).toBe(0);

    expect(await axeViolations(page, page.locator('body'))).toEqual([]);
    await shot(page, 'sala-lista', 1920);
  });

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    test(`${viewport.width}×${viewport.height}: sigue sin scroll y sin letra por debajo de 32 px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockBoard(page, () => ({ status: 200, body: board() }));
      await openBoard(page);
      await expect(page.getByTestId('waiting-room-waiting-item').first()).toBeVisible();
      await expectNoScroll(page);
      expect((await smallestFont(page)).size).toBeGreaterThanOrEqual(32);
      await shot(page, `sala-lista-${viewport.height}`, viewport.width);
    });
  }

  test('modo turno: solo «Turno N»; vacíos con su texto', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockBoard(page, () => ({
      status: 200,
      body: board({
        nameMode: 'TURN_NUMBER',
        messages: [],
        waiting: [
          { key: 'w1', label: 'Turno 7', minutesWaiting: 4 },
          { key: 'w2', label: 'Turno 8', minutesWaiting: 1 },
        ],
        called: [],
      }),
    }));
    await openBoard(page);
    await expect(page.getByTestId('waiting-room-waiting-item')).toHaveText([/^Turno 7/, /^Turno 8/]);
    await expect(page.getByText('Atento a tu número de turno')).toBeVisible();
    await expect(page.getByText('Nadie pasando a consulta ahora')).toBeVisible();
    await expect(page.getByTestId('waiting-room-message')).toHaveCount(0);
    expect(await axeViolations(page, page.locator('body'))).toEqual([]);
  });

  test('destaca a quien pasa a consulta, «Sin conexión» conserva lo último y se recupera; 404 → inactiva', async ({
    page,
  }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 1920, height: 1080 });
    const first = board({ called: [], waiting: [{ key: 'w1', label: 'Ana R.', minutesWaiting: 3 }] });
    const second = board({
      waiting: [],
      called: [
        { key: 'c1', label: 'Ana R.', chairName: 'Sillón 2', providerName: 'Dra. Pérez', minutesSinceCalled: 0 },
      ],
    });
    // Lo que contesta la API en cada fase (en desarrollo, React monta dos veces
    // y pide dos veces al abrir: por fase, no por número de petición).
    let reply: Reply = { status: 200, body: first };
    const calls = await mockBoard(page, () => reply);
    await openBoard(page);
    await expect(page.getByTestId('waiting-room-waiting-item')).toHaveText([/Ana R\./]);
    await expect(page.getByTestId('waiting-room-called-item')).toHaveCount(0);

    // 2.º sondeo (8 s ± 15 %): Ana pasa a consulta y se destaca unos segundos.
    reply = { status: 200, body: second };
    await page.clock.fastForward('00:10');
    const item = page.getByTestId('waiting-room-called-item');
    await expect(item).toHaveAttribute('data-highlighted', 'true');
    await expect(item).toContainText('Sillón 2 · Dra. Pérez');
    await expect(item).toContainText('Ahora');
    await shot(page, 'sala-destacado', 1920);
    expect(await axeViolations(page, page.locator('body'))).toEqual([]);

    // Sin red (y luego un 503): lo último sigue en pantalla con el indicador.
    reply = 'abort';
    let before = calls.count;
    await page.clock.fastForward('00:10');
    await expect.poll(() => calls.count).toBeGreaterThan(before);
    await expect(item).not.toHaveAttribute('data-highlighted', 'true');
    await expect(page.getByTestId('waiting-room-offline')).toHaveText('Sin conexión');
    await expect(item).toContainText('Ana R.');
    reply = { status: 503 };
    before = calls.count;
    await page.clock.fastForward('00:09');
    await expect.poll(() => calls.count).toBeGreaterThan(before);
    await expect(page.getByTestId('waiting-room-offline')).toBeVisible();
    // Se recupera solo en el siguiente reintento (15 s).
    reply = { status: 200, body: second };
    await page.clock.fastForward('00:16');
    await expect(page.getByTestId('waiting-room-offline')).toHaveCount(0);

    // Revocada: el siguiente sondeo da 404 y la pantalla lo dice.
    reply = {
      status: 404,
      body: { code: 'WAITING_ROOM_SCREEN_INACTIVE', message: 'Esta pantalla ya no está activa.' },
    };
    await page.clock.fastForward('00:10');
    await expect(page.getByRole('heading', { name: 'Esta pantalla ya no está activa' })).toBeVisible();
    await expect(page.getByTestId('waiting-room-called-item')).toHaveCount(0);
    const stoppedAt = calls.count;
    await page.clock.fastForward('01:00');
    expect(calls.count).toBe(stoppedAt);
    expect(await axeViolations(page, page.locator('body'))).toEqual([]);
  });

  test('la página sale sin Referer, sin caché y sin indexar', async ({ page }) => {
    await mockBoard(page, () => ({ status: 200, body: board() }));
    const response = await page.goto(`${origin}/sala/${TOKEN}`);
    const headers = response!.headers();
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
