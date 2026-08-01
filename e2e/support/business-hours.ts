import { expect, type Page } from '@playwright/test';

/**
 * Deja la sede de la clínica recién registrada SIN restricción de horario.
 *
 * Por qué hace falta: una sede nueva nace con un horario por defecto (lun–vie
 * 9–13 y 15–19, sáb 9–13, domingo cerrado). Los specs que agendan lo hacen a
 * horas relativas a `now` ("ahora + 61 min"), así que sin esto fallarían con un
 * 400 de "fuera del horario de atención" según la hora y el día en que corra la
 * suite — un rojo intermitente que no dice nada del comportamiento que prueban.
 *
 * Un `PUT` con `ranges: []` es exactamente "esta sede no restringe horarios"
 * (misma semántica que una sede sin configurar), así que además documenta que
 * estos specs no son sobre el horario. Los que SÍ lo prueben deben configurar
 * tramos explícitos en vez de llamar a esto.
 */
export async function disableBusinessHours(page: Page, origin: string): Promise<void> {
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  const accessToken =
    (JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } })
      .state?.accessToken ?? '';
  expect(accessToken, 'disableBusinessHours necesita una sesión ya iniciada').toBeTruthy();

  const res = await page.request.put('http://localhost:3000/api/v1/locations/schedule', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Host': new URL(origin).host,
    },
    data: { timezone: 'America/Bogota', ranges: [] },
  });
  expect(
    res.ok(),
    `No se pudo desactivar el horario de la sede: ${await res.text()}`,
  ).toBeTruthy();
}
