import { expect, type Locator, type Page } from '@playwright/test';

/** La página no se desplaza en horizontal (nada se sale por la derecha). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal de la página').toBeLessThanOrEqual(0);
}

/**
 * Ningún contenedor que hace scroll propio (por defecto `<main>`, que en el
 * layout de la app es quien se desplaza y no el documento) se desplaza en
 * horizontal: `expectNoHorizontalScroll` solo mira el documento y no lo ve
 * (QA DX-107, D1).
 */
export async function expectNoHorizontalScrollIn(page: Page, selector = 'main'): Promise<void> {
  const overflows = await page.evaluate(
    (sel) =>
      Array.from(document.querySelectorAll(sel)).map((el) => ({
        overflow: el.scrollWidth - el.clientWidth,
        tag: el.tagName.toLowerCase(),
      })),
    selector,
  );
  expect(overflows.length, `no hay ningún «${selector}»`).toBeGreaterThan(0);
  for (const { overflow, tag } of overflows) {
    expect(overflow, `scroll horizontal de <${tag}>`).toBeLessThanOrEqual(0);
  }
}

async function expectBoxInside(page: Page, locator: Locator, moment: string): Promise<void> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, `${moment}: el elemento no tiene caja`).not.toBeNull();
  expect(box!.x, `${moment}: borde izquierdo`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${moment}: borde derecho`).toBeLessThanOrEqual(width);
  // Los diálogos van centrados en horizontal (±1 px por el redondeo).
  expect(Math.abs(box!.x + box!.width / 2 - width / 2), `${moment}: centrado`).toBeLessThanOrEqual(1);
}

/**
 * Un diálogo abierto cabe en la pantalla y está centrado, en reposo Y en el
 * primer fotograma de su animación de entrada (DX-140).
 *
 * Medir solo en reposo no basta: el `boundingBox()` de un test rápido cae a
 * veces dentro de los 150 ms de la animación (siempre en la CI, en modo
 * producción) y, si la animación desplaza el diálogo, el resultado depende de
 * la velocidad de la máquina. Por eso se reinicia la animación CSS del
 * diálogo, se congela en t = 0 y se mide; luego se termina y se mide otra vez.
 * Sin animación (p. ej. con `prefers-reduced-motion`) las dos medidas son la
 * de reposo.
 */
export async function expectDialogInsideViewport(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((el) => {
    const node = el as HTMLElement;
    node.style.animation = 'none';
    void node.offsetWidth; // fuerza el reflow para que la animación vuelva a empezar
    node.style.animation = '';
    for (const animation of node.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  await expectBoxInside(page, dialog, 'al empezar la animación de entrada');
  await dialog.evaluate((el) => {
    for (const animation of (el as HTMLElement).getAnimations()) animation.finish();
  });
  await expectBoxInside(page, dialog, 'en reposo');
}

/**
 * El contenido de un diálogo no se desplaza en horizontal: ni el diálogo ni su
 * formulario son más anchos que su caja. `expectNoHorizontalScroll` no lo ve
 * (el documento no se desplaza: el diálogo es `fixed` y recorta), y así se
 * escapó en QA DX-407 una tabla de 594 px dentro de un diálogo de 356 px.
 * Lo que sí puede desplazarse es un marco propio dentro (la tabla en su
 * `overflow-x-auto`), que no cuenta.
 */
export async function expectNoHorizontalOverflowInDialog(dialog: Locator): Promise<void> {
  const boxes = await dialog.evaluate((el) =>
    [el, ...Array.from(el.querySelectorAll('form'))].map((node) => ({
      tag: node.tagName.toLowerCase(),
      overflow: node.scrollWidth - node.clientWidth,
    })),
  );
  for (const { tag, overflow } of boxes) {
    expect(overflow, `scroll horizontal dentro del diálogo (<${tag}>)`).toBeLessThanOrEqual(0);
  }
}
