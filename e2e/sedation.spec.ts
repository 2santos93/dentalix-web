import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { openPatientTab } from './support/patient-tabs';
import { expectNoHorizontalOverflowInDialog, expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-407): hoja de sedación consciente en la evolución.
 *
 * Registra una clínica (su dueño es ADMIN) y crea por la API real un niño con
 * una evolución. En la ficha, «Historia clínica» → «Sedación»:
 *   - valoración previa (ASA, ayuno, Mallampati, peso, talla, acompañante y
 *     consentimiento) con IMC y reversores por peso calculados;
 *   - checklist previo con todos los obligatorios;
 *   - N₂O registrado hace 20 min (por la API): al reabrir, la alerta dice que
 *     pasó el intervalo de 5 min sin toma; una toma la quita;
 *   - egreso con los 6 criterios, constantes al alta e indicaciones: la hoja
 *     queda cerrada, la ficha lo muestra tras recargar y la API responde 405
 *     a quien intente editarla.
 * En escritorio (1440px) y móvil (390px): sin scroll horizontal de la página
 * NI del diálogo; en móvil la tabla de constantes se desplaza en su marco.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const NOTES = 'Resinas en 54 y 64 bajo sedación';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

/**
 * Ni la página ni el diálogo se desplazan en horizontal (QA DX-407: a 390 px
 * la tabla de constantes ensanchaba el diálogo a 594 px sin que la página lo
 * notara).
 */
async function expectNoOverflow(page: Page, dialog: Locator): Promise<void> {
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalOverflowInDialog(dialog);
}

/**
 * La tabla de constantes cabe o, si no (móvil), se desplaza en su propio
 * marco, que entonces es una región con nombre a la que se llega con Tab.
 */
async function expectVitalsTableReachable(dialog: Locator, mobile: boolean): Promise<void> {
  const frame = dialog.getByRole('region', { name: 'Tabla de constantes' });
  if (!mobile) {
    await expect(frame).toHaveCount(0);
    return;
  }
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('tabindex', '0');
  const { scrollWidth, clientWidth } = await frame.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  await frame.focus();
  await frame.press('ArrowRight');
  await expect.poll(() => frame.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
}

async function fillVitals(dialog: Locator, level: string) {
  await dialog.getByLabel('SpO₂ (%)').fill('98');
  await dialog.getByLabel('FC (lpm)').fill('96');
  await dialog.getByLabel('TA sistólica').fill('98');
  await dialog.getByLabel('TA diastólica').fill('60');
  await dialog.getByLabel('FR (rpm)').fill('22');
  await dialog.getByLabel('Nivel de sedación').selectOption(level);
}

for (const viewport of VIEWPORTS) {
  test(`hoja de sedación de punta a punta: valoración, checklist, constantes y egreso (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-sedation-${tag}`,
      clinicName: `Clinica Sedacion ${tag}`,
      fullName: 'Sara Sedación',
      email: `test.user.sedation.${tag}@example.com`,
      password,
    });
    const headers = {
      Authorization: `Bearer ${await accessTokenOf(page)}`,
      'X-Tenant-Host': new URL(origin).host,
    };
    async function post<T>(path: string, data: object): Promise<T> {
      const res = await page.request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    }
    const patient = await post<{ id: string }>('/patients', {
      firstName: 'Martín',
      lastName: `Sedacion${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `SD${tag}`.slice(0, 20),
      sex: 'M',
      birthDate: '2020-04-02',
    });
    const entry = await post<{ id: string }>(`/patients/${patient.id}/clinical-entries`, {
      reason: 'Restauraciones',
      notes: NOTES,
    });
    const sheetPath = `/patients/${patient.id}/clinical-entries/${entry.id}/sedation`;

    await page.goto(`${origin}/patients/${patient.id}`);
    await openPatientTab(page, 'Historia clínica');
    await expect(page.getByText(NOTES).locator('visible=true')).toBeVisible({ timeout: 15_000 });

    const openSheet = async () => {
      await page
        .getByRole('button', { name: /Hoja de sedación de la evolución del/ })
        .locator('visible=true')
        .click();
      const dialog = page.getByRole('dialog', { name: 'Hoja de sedación' });
      await expect(dialog).toBeVisible();
      return dialog;
    };

    // 1. Valoración previa.
    let dialog = await openSheet();
    await expect(dialog.getByText('Esta evolución no tiene hoja de sedación.')).toBeVisible();
    await dialog.getByLabel('Clase ASA').selectOption('II');
    await dialog.getByLabel('Ayuno de líquidos claros (h)').fill('2');
    await dialog.getByLabel('Ayuno de sólidos y leche (h)').fill('6');
    await dialog.getByLabel('Vía aérea (Mallampati)').selectOption('1');
    await dialog.getByLabel('Peso hoy (kg)').fill('15');
    await dialog.getByLabel('Talla (cm)').fill('100');
    await expect(dialog.getByText('Naloxona 1,5 mg · Flumazenil 0,15 mg')).toBeVisible();
    await dialog.getByLabel('Acompañante adulto').fill('Laura Ortiz');
    await dialog.getByLabel('Relación con el paciente').fill('Madre');

    // Sin consentimiento, el servidor dice qué falta.
    await dialog.getByRole('button', { name: 'Abrir hoja de sedación' }).click();
    await expect(dialog.getByText(/consentimiento de sedación está firmado/i).first()).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'El consentimiento de sedación está firmado' }).check();
    await dialog.getByRole('button', { name: 'Abrir hoja de sedación' }).click();
    await expect(dialog.getByText('Hoja abierta con la valoración previa.')).toBeVisible({ timeout: 10_000 });
    await expectNoOverflow(page, dialog);

    // 2. Checklist previo.
    for (const label of [
      /Monitores probados/,
      /Oxígeno y aspiración/,
      /Kit de emergencia/,
      /Reversores preparados/,
      /Sin contraindicación/,
    ]) {
      await dialog.getByRole('checkbox', { name: label }).check();
    }
    await dialog.getByRole('button', { name: 'Registrar checklist' }).click();
    await expect(dialog.getByText('Checklist registrado.')).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    // 3. N₂O hace 20 min sin tomas: la hoja avisa del intervalo pasado.
    await post(`${sheetPath}/agents`, {
      kind: 'NITROUS_OXIDE',
      n2oPercent: 30,
      flowLpm: 6,
      administeredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    dialog = await openSheet();
    await expect(dialog.getByRole('alert')).toContainText('Pasó el intervalo de 5 min sin toma');
    await expect(dialog.getByText(/N₂O 30 % · 6 l\/min/)).toBeVisible();
    await expectNoOverflow(page, dialog);

    // 4. Toma intraoperatoria: el aviso desaparece.
    await fillVitals(dialog, 'MINIMAL');
    await dialog.getByRole('button', { name: 'Registrar toma' }).click();
    await expect(dialog.getByText('Toma registrada.')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByText(/Próxima toma antes de las/)).toBeVisible();
    // 20 min sin toma con intervalo de 5: vencieron 3 (la del minuto 20 llegó).
    await expect(dialog.getByText(/3 intervalos de 5 min vencidos sin toma/)).toBeVisible();
    // Con una toma, la tabla aparece: el diálogo no se ensancha (QA DX-407).
    await expectNoOverflow(page, dialog);
    await expectVitalsTableReachable(dialog, viewport.width < 640);
    // El formulario de la toma va en una columna en móvil: los campos no se
    // salen por la derecha.
    for (const label of ['Hora', 'FC (lpm)', 'TA diastólica', 'CO₂ espirado (mmHg, opcional)']) {
      const box = await dialog.getByLabel(label, { exact: true }).boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.x + box!.width, `${label}: borde derecho`).toBeLessThanOrEqual(viewport.width);
    }

    // 5. Egreso.
    await dialog.getByRole('radio', { name: 'Egreso' }).check();
    await expectNoOverflow(page, dialog);
    for (const label of [
      'Función cardiovascular satisfactoria y estable',
      'Vía aérea permeable y estable',
      'Despierta con facilidad',
      'Reflejos protectores intactos',
      'Habla y se sienta (o se mantiene) como antes de la sedación',
      'Hidratación adecuada',
    ]) {
      await dialog.getByRole('checkbox', { name: label }).check();
    }
    await fillVitals(dialog, 'AWAKE');
    await dialog.getByRole('checkbox', { name: /Indicaciones postoperatorias entregadas/ }).check();
    await expect(dialog.getByLabel('Se entrega a')).toHaveValue('Laura Ortiz');
    // Las tomas las anotó el propio operador: quién monitorizó se elige a mano.
    const monitor = dialog.getByLabel('Quién monitorizó');
    await expect(monitor).toHaveValue('');
    await monitor.selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Firmar egreso' }).click();
    await expect(dialog.getByText('Egreso firmado. La hoja queda cerrada.')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: 'Registrar toma' })).toHaveCount(0);
    await expectNoOverflow(page, dialog);

    // Inalterable: la API responde 405 remitiendo a la adenda.
    const patch = await page.request.patch(`${API_URL}${sheetPath}`, {
      headers,
      data: { grade: 'MODERATE' },
    });
    expect(patch.status()).toBe(405);
    expect(await patch.text()).toContain('adenda');

    await page.reload();
    await openPatientTab(page, 'Historia clínica');
    await expect(
      page.getByText('Mínima (ansiolisis) · ASA II · Egreso firmado').locator('visible=true'),
    ).toBeVisible({ timeout: 15_000 });
  });
}
