import type { Locator, Page } from '@playwright/test';

/**
 * `DataList` (UX v2, `src/components/ui/data-list.tsx`) monta UNA de dos
 * marcas según el ancho: una tabla de verdad desde 640 px y una lista de
 * tarjetas compactas en el teléfono, las dos con el mismo nombre accesible.
 * Estos helpers encuentran la que esté montada, así un spec sirve en 1440 y en
 * 390 sin bifurcar.
 */
type Scope = Page | Locator;

/** La lista por su nombre: la `table` o la `list` que esté en pantalla. */
export function dataList(scope: Scope, name: string | RegExp): Locator {
  return scope.getByRole('table', { name }).or(scope.getByRole('list', { name }));
}

/** Sus filas: `row` en la tabla (incluye la de cabecera), `listitem` en el teléfono. */
export function dataListRows(list: Locator): Locator {
  return list.getByRole('row').or(list.getByRole('listitem'));
}

/** Abre el «⋯» de una fila (`RowActions`) y elige una acción del menú. */
export async function rowAction(page: Page, row: Locator, item: string | RegExp): Promise<void> {
  await row.getByRole('button', { name: /^Acciones de / }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
