import { expect, type Page } from '@playwright/test';
import { accessTokenOf } from './auth';
import { API_URL } from './urls';

/**
 * Deja la sede de la clínica recién registrada SIN restricción de horario.
 *
 * Por qué hace falta: una sede nueva nace con un horario por defecto (lun–vie
 * 9–13 y 15–19, sáb 9–13, domingo cerrado). Los specs que agendan lo hacen a
 * horas relativas a `now` ("ahora + 61 min"), así que sin esto fallarían con un
 * 422 de "fuera del horario de atención" según la hora y el día en que corra la
 * suite — un rojo intermitente que no dice nada del comportamiento que prueban.
 *
 * Un `PUT` con `ranges: []` es exactamente "esta sede no restringe horarios"
 * (misma semántica que una sede sin configurar), así que además documenta que
 * estos specs no son sobre el horario. Los que SÍ lo prueben deben configurar
 * tramos explícitos en vez de llamar a esto. Sin `timezone` (G1): el horario
 * usa la zona de la sede.
 */
export async function disableBusinessHours(page: Page, origin: string): Promise<void> {
  // Necesita una sesión ya iniciada en la página (cookie de refresh, DX-062).
  const accessToken = await accessTokenOf(page);

  const res = await page.request.put(`${API_URL}/locations/schedule`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Host': new URL(origin).host,
    },
    data: { ranges: [] },
  });
  expect(
    res.ok(),
    `No se pudo desactivar el horario de la sede: ${await res.text()}`,
  ).toBeTruthy();
}
