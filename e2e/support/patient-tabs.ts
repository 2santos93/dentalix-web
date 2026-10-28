import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Abre una pestaña de la ficha del paciente con un clic y espera a que quede
 * seleccionada, reintentando el clic si se pierde.
 *
 * La pestaña vive en la URL: el clic hace `router.replace(?tab=…)`, una
 * navegación suave con ida y vuelta RSC antes de que `useSearchParams` cambie.
 * Con el servidor cargado esa navegación puede perderse (el nodo se remonta
 * mientras la ficha recarga, o el router descarta el replace), y la pestaña se
 * queda en «Datos». Volver a pulsar la pestaña ya seleccionada es inocuo
 * (`setParams` escribe el mismo `tab`).
 *
 * Solo para specs cuyo tema es el clic (teclado, sincronía con la URL). Si el
 * spec solo necesita el contenido, mejor el enlace directo `?tab=<clave>`.
 */
export async function openPatientTab(page: Page, name: string): Promise<Locator> {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  return tab;
}
