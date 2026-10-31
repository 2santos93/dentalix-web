import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-307): anestesia local en la evolución.
 *
 * Registra una clínica (su dueño es ADMIN), crea por la API real una paciente
 * de 8 años SIN peso en la anamnesis con una evolución de exodoncia. En la
 * ficha, «Historia clínica» → «Anestesia» de la evolución:
 *   - el catálogo vacío ofrece «Cargar anestésicos sugeridos» (ADMIN);
 *   - 3 carpules de articaína 4 % (1,7 ml): pide el peso (menor de 12 años);
 *     con 20 kg la barra marca 204 mg y 146 % y exige confirmación + motivo;
 *   - al guardar, la evolución muestra el registro y el acumulado, y sigue
 *     tras recargar; la API responde 405 a quien intente editarlo.
 * En escritorio (1440px) y móvil (390px, sin scroll horizontal).
 *
 * DX-418: el acumulado es del PACIENTE en las últimas 24 h. Un niño de 20 kg
 * con 3 carpules de lidocaína (77 %) en una evolución: al abrir «Anestesia»
 * en otra evolución del mismo día la barra ya marca 108 mg con el desglose
 * (evolución y profesional), y otros 3 carpules dan 216 mg · 154 % y piden
 * confirmación y motivo.
 *
 * DX-420: niño de 8 años y 20 kg con lidocaína: el máximo es el pediátrico
 * de la AAPD (4,4 mg/kg = 88 mg) con la fuente a la vista, «quedan X mg ≈ Y
 * carpules» y la barra de epinefrina en mg; en una niña de 3 años la
 * articaína avisa de la edad mínima y exige confirmación y motivo.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const NOTES = 'Exodoncia de 85 por absceso';
const REASON = 'Exodoncia infantil compleja, valorada con la madre';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  lastName: string,
  tag: string,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Lucía',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `AN${tag}`.slice(0, 20),
    sex: 'F',
    birthDate: '2018-03-01',
  });
  const entry = await post<{ id: string }>(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Exodoncia simple',
    notes: NOTES,
  });
  return { patientId: patient.id, entryId: entry.id, headers };
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test(`exodoncia infantil que supera la dosis máxima, con justificación (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-anesthesia-${tag}`,
      clinicName: `Clinica Anestesia ${tag}`,
      fullName: 'Ana Anestesia',
      email: `test.user.anesthesia.${tag}@example.com`,
      password,
    });
    const seeded = await seed(page.request, origin, await accessTokenOf(page), `Anestesia${tag}`, tag);

    await page.goto(`${origin}/patients/${seeded.patientId}`);
    await openPatientTab(page, 'Historia clínica');
    await expect(page.getByText(NOTES).locator('visible=true')).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /Anestesia de la evolución del/ })
      .locator('visible=true')
      .click();
    const dialog = page.getByRole('dialog', { name: 'Anestesia local' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Aún no hay anestesia registrada en esta evolución.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cargar anestésicos sugeridos' }).click();

    const anesthetic = dialog.getByLabel('Anestésico');
    await expect(anesthetic).toBeVisible({ timeout: 10_000 });
    await anesthetic.selectOption({ label: 'Articaína 4 % con epinefrina 1:100.000 · 1,7 ml · desde 4 años' });
    await dialog.getByLabel('Carpules').fill('3');
    await dialog.getByLabel('Técnica').selectOption('NERVE_BLOCK');
    await dialog.getByLabel('Zona o dientes (FDI)').fill('85');

    // Menor de 12 años sin peso: lo pide antes de guardar.
    await expect(dialog.getByText('Menor de 12 años: anota el peso antes de guardar.')).toBeVisible();
    await dialog.getByLabel('Peso del paciente (kg)').fill('20');
    await expect(dialog.getByText(/204 mg · 146 % del máximo/)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Dosis máxima superada: 204 mg de 140 mg \(146 %\)/)).toBeVisible();

    // Bloqueo blando: sin confirmación ni motivo no se guarda.
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog.getByText('Marca la confirmación para guardar pese al aviso.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await dialog.getByRole('checkbox', { name: /Confirmo que conozco el aviso/ }).check();
    await dialog.getByLabel('Motivo').fill(REASON);
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const recorded = page
      .getByRole('list', { name: /Anestesia local de la evolución del/ })
      .locator('visible=true');
    await expect(recorded).toContainText('3 carp. · 204 mg · Troncular · 85');
    await expect(recorded).toContainText(REASON);
    await expect(
      page.getByText('Acumulado del paciente en 24 h: 204 mg · 146 % del máximo').locator('visible=true'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Inalterable: la API responde 405 remitiendo a la adenda.
    const list = await page.request.get(`${API_URL}/patients/${seeded.patientId}/anesthesia`, {
      headers: seeded.headers,
    });
    const [record] = (await list.json()) as { id: string }[];
    const patch = await page.request.patch(
      `${API_URL}/patients/${seeded.patientId}/clinical-entries/${seeded.entryId}/anesthesia/${record.id}`,
      { headers: seeded.headers, data: { carpules: 1 } },
    );
    expect(patch.status()).toBe(405);
    expect(await patch.text()).toContain('adenda');

    await page.reload();
    await openPatientTab(page, 'Historia clínica');
    await expect(
      page
        .getByRole('list', { name: /Anestesia local de la evolución del/ })
        .locator('visible=true'),
    ).toContainText('204 mg', { timeout: 15_000 });
  });
}

async function seedTwoEntries(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  lastName: string,
  tag: string,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Mateo',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `AW${tag}`.slice(0, 20),
    sex: 'M',
    birthDate: '2018-03-01',
  });
  const morning = await post<{ id: string }>(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Exodoncia de la mañana',
    notes: 'Exodoncia de 85',
  });
  await post(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Urgencia de la tarde',
    notes: 'Exodoncia de 75',
  });
  const catalog = await post<{ id: string; sampleCode: string | null }[]>('/anesthetics/samples', {});
  const lidocaine = catalog.find((p) => p.sampleCode === 'LIDOCAINE_2_EPI');
  expect(lidocaine, 'falta la lidocaína de ejemplo').toBeTruthy();
  // El criterio de DX-418 se escribió con el máximo de adulto (7 mg/kg): esta
  // clínica quita el pediátrico del catálogo (DX-420, editable por el ADMIN).
  const patched = await request.patch(`${API_URL}/anesthetics/${lidocaine!.id}`, {
    headers,
    data: { pediatricMaxMgPerKg: null },
  });
  expect(patched.ok(), `PATCH del anestésico falló: ${await patched.text()}`).toBeTruthy();
  await post(`/patients/${patient.id}/clinical-entries/${morning.id}/anesthesia`, {
    anestheticId: lidocaine!.id,
    carpules: 3,
    technique: 'INFILTRATION',
    weightKg: 20,
  });
  return { patientId: patient.id };
}

for (const viewport of VIEWPORTS) {
  test(`DX-418: el acumulado del paciente en 24 h suma otra evolución y bloquea al superar el máximo (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `w${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-anesthesia-window-${tag}`,
      clinicName: `Clinica Anestesia 24h ${tag}`,
      fullName: 'Ana Acumulado',
      email: `test.user.anesthesia.window.${tag}@example.com`,
      password,
    });
    const seeded = await seedTwoEntries(page.request, origin, await accessTokenOf(page), `Ventana${tag}`, tag);

    await page.goto(`${origin}/patients/${seeded.patientId}`);
    await openPatientTab(page, 'Historia clínica');
    await expect(page.getByText('Exodoncia de 75').locator('visible=true')).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /Anestesia de la evolución del .* Urgencia de la tarde/ })
      .locator('visible=true')
      .click();
    const dialog = page.getByRole('dialog', { name: 'Anestesia local' });
    await expect(dialog.getByText('Aún no hay anestesia registrada en esta evolución.')).toBeVisible();

    // Sin nada en esta evolución, la barra ya enseña lo de la mañana.
    const bar = dialog.getByRole('region', { name: 'Acumulado del paciente en las últimas 24 h' });
    await expect(bar).toContainText('108 mg · 77 % del máximo', { timeout: 10_000 });
    const breakdown = bar.getByRole('list', { name: 'Desglose por evolución y profesional' });
    await expect(breakdown).toContainText('Otra evolución · Ana Acumulado');
    await expect(breakdown).toContainText('3 carp. · 108 mg (77 %)');

    await dialog.getByLabel('Anestésico').selectOption({ label: 'Lidocaína 2 % con epinefrina 1:100.000 · 1,8 ml' });
    await dialog.getByLabel('Carpules').fill('3');
    await expect(bar).toContainText('216 mg · 154 % del máximo', { timeout: 10_000 });
    await expect(bar).toContainText('Esta dosis, sin guardar: 108 mg');
    await expect(dialog.getByText(/Dosis máxima superada: 216 mg de 140 mg \(154 %\)/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog.getByText('Marca la confirmación para guardar pese al aviso.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await dialog.getByRole('checkbox', { name: /Confirmo que conozco el aviso/ }).check();
    await dialog.getByLabel('Motivo').fill('Segunda exodoncia urgente, valorada con la familia');
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(
      page.getByText('Acumulado del paciente en 24 h: 216 mg · 154 % del máximo').locator('visible=true'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

async function seedChildren(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  lastName: string,
  tag: string,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  async function child(firstName: string, birthDate: string, doc: string) {
    const patient = await post<{ id: string }>('/patients', {
      firstName,
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `${doc}${tag}`.slice(0, 20),
      sex: 'F',
      birthDate,
    });
    await post(`/patients/${patient.id}/clinical-entries`, {
      reason: 'Pulpotomía',
      notes: `Pulpotomía de 75 (${firstName})`,
    });
    return patient.id;
  }
  await post('/anesthetics/samples', {});
  return {
    school: await child('Vera', '2018-03-01', 'AP'),
    toddler: await child('Nora', new Date(Date.now() - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10), 'AT'),
  };
}

for (const viewport of VIEWPORTS) {
  test(`DX-420: máximo pediátrico con fuente, «quedan», epinefrina y edad mínima (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `p${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-anesthesia-ped-${tag}`,
      clinicName: `Clinica Anestesia Pediatrica ${tag}`,
      fullName: 'Ana Pediatría',
      email: `test.user.anesthesia.ped.${tag}@example.com`,
      password,
    });
    const seeded = await seedChildren(page.request, origin, await accessTokenOf(page), `Pediatria${tag}`, tag);

    // Niña de 8 años, 20 kg, 1 carpule de lidocaína.
    await page.goto(`${origin}/patients/${seeded.school}`);
    await openPatientTab(page, 'Historia clínica');
    await page
      .getByRole('button', { name: /Anestesia de la evolución del/ })
      .locator('visible=true')
      .click();
    let dialog = page.getByRole('dialog', { name: 'Anestesia local' });
    await dialog.getByLabel('Anestésico').selectOption({ label: 'Lidocaína 2 % con epinefrina 1:100.000 · 1,8 ml' });
    await dialog.getByLabel('Carpules').fill('1');
    await dialog.getByLabel('Peso del paciente (kg)').fill('20');
    const bar = dialog.getByRole('region', { name: 'Acumulado del paciente en las últimas 24 h' });
    await expect(bar).toContainText('Máximo 88 mg (4,4 mg/kg)', { timeout: 10_000 });
    await expect(bar).toContainText('Fuente: AAPD');
    await expect(bar).toContainText('Quedan 52 mg ≈ 1,25 carpules de 1,8 ml');
    await expect(bar.getByRole('meter', { name: 'Epinefrina por cita' })).toHaveAttribute(
      'aria-valuetext',
      '0,018 de 0,2 mg · 9 %',
    );
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Niña de 3 años: la articaína no se recomienda en menores de 4.
    await page.goto(`${origin}/patients/${seeded.toddler}`);
    await openPatientTab(page, 'Historia clínica');
    await page
      .getByRole('button', { name: /Anestesia de la evolución del/ })
      .locator('visible=true')
      .click();
    dialog = page.getByRole('dialog', { name: 'Anestesia local' });
    await dialog
      .getByLabel('Anestésico')
      .selectOption({ label: 'Articaína 4 % con epinefrina 1:100.000 · 1,7 ml · desde 4 años' });
    await dialog.getByLabel('Carpules').fill('0,5');
    await dialog.getByLabel('Peso del paciente (kg)').fill('14');
    await expect(dialog.getByText(/no recomendada en menores de 4 años/)).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog.getByText('Marca la confirmación para guardar pese al aviso.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('checkbox', { name: /Confirmo que conozco el aviso/ }).check();
    await dialog.getByLabel('Motivo').fill('Sin alternativa en el gabinete, valorada con la familia');
    await dialog.getByRole('button', { name: 'Registrar anestesia' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
}
