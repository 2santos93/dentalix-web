import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { sedeDate, sedeTime } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-291 (porción 2 de DX-279): la clínica tiene una política de 24 h con
 * cargo de 50.000 COP. El paciente abre el enlace de confirmación 5 h antes:
 * ve el texto de la política y «Cancelación con menos de 24 h de aviso»; sin
 * marcar la aceptación no puede cancelar; con ella, cancela. El ADMIN abre la
 * cita en la agenda, «Generar cargo» por 40.000 (no deja más de 50.000) y
 * recepción lo cobra desde el estado de cuenta con su recibo consecutivo. A
 * 1440 y a 390 px, sin scroll horizontal; axe en claro y oscuro sobre la
 * página pública (con la marca de la clínica) y el diálogo del cargo.
 *
 * Una clínica nueva por corrida. En serie.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `cargos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.fee.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.fee.${suffix}@example.com` };
const POLICY_TEXT = 'Si no puedes venir, avísanos con un día de antelación.';

let session: ApiSession;
let providerId: string;
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Cargos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  providerId = ((await staff.json()) as { userId: string; fullName: string }[]).find(
    (m) => m.fullName === admin.fullName,
  )!.userId;
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  const principal = ((await locations.json()) as { id: string }[])[0].id;
  await apiPost(request, session, `/locations/${principal}/cancellation-policy`, {
    noticeHours: 24,
    suggestedFee: 50000,
    currency: 'COP',
    patientText: POLICY_TEXT,
  });
});

/** Paciente con una cita dentro de `hours` horas y su enlace de confirmación. */
async function lateAppointment(
  request: Parameters<typeof apiPost>[0],
  lastName: string,
  hours: number,
): Promise<{ patientId: string; start: Date; token: string; appointmentId: string }> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Paula',
    lastName,
    docType: 'CC',
    docNumber: lastName.slice(0, 20),
    sex: 'F',
  });
  const start = new Date(Math.ceil((Date.now() + hours * 3_600_000) / 60_000) * 60_000);
  const appointment = await apiPost<{ id: string }>(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
  const link = await apiPost<{ url: string }>(
    request,
    session,
    `/appointments/${appointment.id}/confirmation-link`,
    {},
  );
  return { patientId: patient.id, start, token: link.url.split('/confirmar/')[1], appointmentId: appointment.id };
}

/** Violaciones serias o críticas de axe dentro de `selector`. */
async function serious(page: Page, selector: string) {
  await page.mouse.move(0, 0);
  await page.locator(selector).first().evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
  await page.evaluate(axeSource);
  const results = await page.evaluate(async (include) => {
    const axe = (window as unknown as { axe: { run: (context: string) => Promise<AxeResults> } }).axe;
    return axe.run(include);
  }, selector);
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

async function flow(page: Page, request: Parameters<typeof apiPost>[0], width: number, lastName: string) {
  const height = width < 768 ? 844 : 900;
  await page.setViewportSize({ width, height });
  // Horas distintas por test: en la agenda no se confunden las dos citas.
  const { patientId, start, token } = await lateAppointment(request, lastName, width < 768 ? 6 : 5);

  // --- Paciente: enlace público, sin sesión.
  await page.context().clearCookies();
  await page.goto(`${origin}/confirmar/${token}`);
  const policy = page.getByRole('region', { name: 'Política de cancelación' });
  await expect(policy).toBeVisible({ timeout: 15_000 });
  await expect(policy).toContainText('avísanos con al menos 24 h de antelación');
  await expect(policy).toContainText(POLICY_TEXT);
  await expect(policy).toContainText('50.000');
  await expect(policy.getByText('Cancelación con menos de 24 h de aviso')).toBeVisible();
  await expectNoHorizontalScroll(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    expect.soft(await serious(page, 'main'), `página pública ${width} ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'marca que aceptas la política' })).toBeVisible();
  const box = page.getByRole('checkbox', { name: /acepto la política de cancelación/ });
  await expect(box).toBeFocused();
  await box.check();
  await page.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByText(/Cancelaste la cita/)).toBeVisible({ timeout: 10_000 });

  // --- ADMIN: agenda → detalle → «Generar cargo».
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  const listToggle = page.getByRole('button', { name: 'Lista', exact: true });
  if (await listToggle.isVisible()) await listToggle.click();
  await page.getByLabel('Fecha', { exact: true }).fill(sedeDate(start));
  const end = new Date(start.getTime() + 30 * 60_000);
  // A 1440 es la fila de la tabla; a 390, la tarjeta: el botón visible.
  const detail = page
    .getByRole('button', { name: new RegExp(`Detalle de la cita de ${sedeTime(start)}–${sedeTime(end)}`) })
    .locator('visible=true')
    .first();
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await detail.click();
  const sheet = page.getByRole('dialog');
  const panel = sheet.getByTestId('cancellation-fee-panel');
  await expect(panel).toContainText('Importe sugerido', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Generar cargo' }).click();
  const chargeDialog = page.getByRole('dialog', { name: 'Generar cargo' });
  await expectDialogInsideViewport(page, chargeDialog);
  const amount = chargeDialog.getByLabel('Importe');
  await amount.fill('60.000');
  await chargeDialog.getByRole('button', { name: 'Generar cargo' }).click();
  await expect(chargeDialog.getByText(/no puede superar/)).toBeVisible();
  await amount.fill('40.000');
  await expectNoHorizontalScroll(page);
  const chargeDialogSelector = `[id="${await chargeDialog.getAttribute('id')}"]`;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    expect.soft(await serious(page, chargeDialogSelector), `diálogo del cargo ${width} ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await chargeDialog.getByRole('button', { name: 'Generar cargo' }).click();
  await expect(chargeDialog).toBeHidden({ timeout: 10_000 });
  await expect(panel).toContainText(/Cargo generado: .*40\.000/);
  await expectNoHorizontalScroll(page);

  // --- Recepción: lo cobra desde el estado de cuenta, con recibo consecutivo.
  await page.context().clearCookies();
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${patientId}?tab=account-statement`);
  const statement = page.locator('#tabpanel-account-statement');
  await expect(statement.getByRole('region', { name: 'Resumen en COP' })).toBeVisible({ timeout: 15_000 });
  await statement.getByRole('button', { name: 'Registrar abono' }).click();
  const payDialog = page.getByRole('dialog', { name: 'Registrar abono' });
  await expect(payDialog.getByLabel('Plan').locator('option:checked')).toContainText('Saldo 40.000', {
    timeout: 10_000,
  });
  await payDialog.getByLabel('Importe').fill('40.000');
  await payDialog.getByLabel('Método').selectOption('CASH');
  await expectNoHorizontalScroll(page);
  await payDialog.getByRole('button', { name: 'Registrar abono' }).click();
  await expect(payDialog).toBeHidden({ timeout: 10_000 });
  await expect(statement.getByRole('region', { name: 'Resumen en COP' }).getByTestId('balance')).toContainText(
    '0',
    { timeout: 10_000 },
  );

  // El abono lleva su recibo consecutivo (DX-136).
  const plans = await request.get(`${API_URL}/patients/${patientId}/billable-plans`, {
    headers: session.headers,
  });
  const planId = ((await plans.json()) as { id: string }[])[0]?.id;
  const payments = await request.get(`${API_URL}/treatment-plans/${planId}/payments`, {
    headers: session.headers,
  });
  expect(((await payments.json()) as { receiptNumber: string }[])[0].receiptNumber).toMatch(/^[A-Z0-9]+-\d{6}$/);
  await page.context().clearCookies();
}

test('1440 px: cancelar tarde por el enlace → generar cargo → cobrarlo', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 1440, `Escritorio${suffix}`.slice(0, 30));
});

test('390 px: el mismo flujo sin scroll horizontal', async ({ page, request }) => {
  test.setTimeout(180_000);
  await flow(page, request, 390, `Movil${suffix}`.slice(0, 30));
});

test('QA 409 real: Enter tras conflicto de generar cargo', async ({page, request}) => {
 test.setTimeout(180000);
 const {start,token,appointmentId}=await lateAppointment(request, `Carrera${suffix}`.slice(0,30), 9);
 await page.goto(`${origin}/confirmar/${token}`);
 await page.getByRole('checkbox', {name:/acepto la política de cancelación/}).check();
 await page.getByRole('button',{name:'Cancelar cita'}).click();
 await expect(page.getByText(/Cancelaste la cita/)).toBeVisible();
 await loginAs(page,origin,admin.email,password); await page.goto(`${origin}/agenda`);
 await page.getByRole('button',{name:'Día',exact:true}).click();
 const toggle=page.getByRole('button',{name:'Lista',exact:true}); if(await toggle.isVisible()) await toggle.click();
 await page.getByLabel('Fecha',{exact:true}).fill(sedeDate(start));
 const end=new Date(start.getTime()+30*60000);
 await page.getByRole('button',{name:new RegExp(`Detalle de la cita de ${sedeTime(start)}–${sedeTime(end)}`)}).locator('visible=true').first().click();
 const panel=page.getByTestId('cancellation-fee-panel'); await expect(panel).toContainText('Importe sugerido');
 await panel.getByRole('button',{name:'Generar cargo'}).click();
 const dialog=page.getByRole('dialog',{name:'Generar cargo'}); const amount=dialog.getByLabel('Importe');
 const other=await request.post(`${API_URL}/appointments/${appointmentId}/cancellation-fee`,{headers:session.headers,data:{}});
 expect(other.ok(),await other.text()).toBeTruthy();
 let attempts=0; page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee`)) attempts++});
 const conflict=page.waitForResponse(r=>r.url().endsWith(`/appointments/${appointmentId}/cancellation-fee`) && r.status()===409);
 await dialog.getByRole('button',{name:'Generar cargo'}).click(); await conflict;
 await expect(dialog.getByRole('status')).toBeVisible();
 await amount.press('Enter'); await page.waitForTimeout(1000);
 console.log('QA-CHARGE-409-ATTEMPTS', attempts); expect(attempts).toBe(1);
});

test('QA reintento GET y foco tras condonar', async ({page, request}) => {
 test.setTimeout(180000);
 const {start,token,appointmentId}=await lateAppointment(request, `Condonar${suffix}`.slice(0,30), 11);
 await page.goto(`${origin}/confirmar/${token}`); await page.getByRole('checkbox',{name:/acepto la política de cancelación/}).check(); await page.getByRole('button',{name:'Cancelar cita'}).click(); await expect(page.getByText(/Cancelaste la cita/)).toBeVisible();
 await loginAs(page,origin,admin.email,password); await page.goto(`${origin}/agenda`);
 await page.getByRole('button',{name:'Día',exact:true}).click(); const toggle=page.getByRole('button',{name:'Lista',exact:true}); if(await toggle.isVisible()) await toggle.click(); await page.getByLabel('Fecha',{exact:true}).fill(sedeDate(start));
 const end=new Date(start.getTime()+30*60000); let failed=false;
 await page.route(`**/appointments/${appointmentId}/cancellation-fee`,async route=>{if(route.request().method()==='GET' && !failed){failed=true; await route.fulfill({status:500,contentType:'application/json',body:'{}'});} else await route.continue()});
 await page.getByRole('button',{name:new RegExp(`Detalle de la cita de ${sedeTime(start)}–${sedeTime(end)}`)}).locator('visible=true').first().click();
 const sheet=page.getByRole('dialog'); await expect(sheet.getByText('No se pudo cargar el estado del cargo.')).toBeVisible();
 await sheet.getByRole('button',{name:/reintentar/i}).click(); const panel=page.getByTestId('cancellation-fee-panel'); await expect(panel).toContainText('Importe sugerido');
 await panel.getByRole('button',{name:'Condonar'}).click(); const dialog=page.getByRole('dialog',{name:'Condonar el cargo'});
 await page.evaluate(axeSource);
 for (const width of [390, 1440]) {
   await page.setViewportSize({width,height:900});
   for (const colorScheme of ['light','dark'] as const) {
     await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
     await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
     const violations = await dialog.evaluate(async (element) => {
       const axe = (window as unknown as {axe:{run:(context:Element)=>Promise<AxeResults>}}).axe;
       return (await axe.run(element)).violations.map((v)=>({id:v.id, nodes:v.nodes.map((n)=>n.target)}));
     });
     console.log('QA-WAIVE-AXE',width,colorScheme,JSON.stringify(violations));
     expect(violations).toEqual([]);
   }
 }
 await dialog.getByLabel('Motivo').fill('Cortesía de clínica'); await dialog.getByRole('button',{name:'Condonar'}).click(); await expect(dialog).toBeHidden();
 const active=await page.evaluate(()=>({tag:document.activeElement?.tagName, text:document.activeElement?.textContent?.trim().slice(0,80)}));console.log('QA-WAIVE-FOCUS',JSON.stringify(active));
 await expect(panel.getByRole('heading')).toBeFocused();
});
