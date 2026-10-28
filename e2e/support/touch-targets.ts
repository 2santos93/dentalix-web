import { expect, type Locator } from '@playwright/test';

/** Objetivo táctil mínimo de DESIGN.md. No se rebaja: solo se redondea la medida. */
export const TOUCH_TARGET_PX = 44;

/**
 * Una medida de `getBoundingClientRect` redondeada a centésimas. Un control de
 * 44 px puede medir 43.9998 por el redondeo del layout o por un `transform`
 * que aún no llegó a 1; con dos decimales cuenta como 44, y uno de 43.99 sigue
 * fallando.
 */
export function touchPx(px: number): number {
  return Math.round(px * 100) / 100;
}

/** El tamaño medido llega al objetivo táctil (con la medida redondeada). */
export function meetsTouchTarget(px: number): boolean {
  return touchPx(px) >= TOUCH_TARGET_PX;
}

/**
 * Espera a que terminen las animaciones finitas de `scope` y de sus
 * descendientes (la entrada de un diálogo, una lista que se despliega) y dos
 * fotogramas más, para medir en reposo. Una infinita (un spinner) no termina
 * nunca y se ignora; una cancelada rechaza `finished` y también se ignora.
 */
export async function waitForAnimationsSettled(scope: Locator): Promise<void> {
  await scope.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/**
 * `target` mide al menos 44 px de alto (y de ancho con `width: true`), medido
 * con `scope` ya en reposo: por defecto el propio control; dentro de un
 * diálogo recién abierto, pásale el diálogo.
 */
export async function expectTouchTarget(
  target: Locator,
  { scope = target, width = false, label = 'objetivo táctil' }: { scope?: Locator; width?: boolean; label?: string } = {},
): Promise<void> {
  await waitForAnimationsSettled(scope);
  const box = await target.boundingBox();
  expect(box, `${label}: el control no tiene caja`).not.toBeNull();
  expect(touchPx(box!.height), `${label}: alto`).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  if (width) expect(touchPx(box!.width), `${label}: ancho`).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
}
